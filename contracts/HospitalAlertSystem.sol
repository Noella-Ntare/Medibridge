// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  HospitalAlertSystem (MediBridge)
 * @notice A shared, tamper-evident board where registered hospitals in Kigali post and
 *         answer urgent requests for BLOOD, MEDICATION and PATIENT TRANSFERS.
 *
 * PROBLEM  Inter-hospital requests are made by phone or paper, so they are poorly
 *          documented and hard to audit (e.g. ambulance times recorded in only ~3% of
 *          transfer letters in a Kigali study).
 * SOLUTION Every request and response is stored on Ethereum with a timestamp and the
 *          sending hospital's address, so the history cannot be quietly changed.
 * PRIVACY  The ledger is public. NEVER put patient names or IDs in any text field.
 *          Describe the need only (e.g. "O-negative blood, 4 units").
 *
 * LIFECYCLE  Open -> Responded -> Fulfilled        (normal path)
 *            Open or Responded -> Cancelled        (requester withdraws)
 *
 * ROLES (OpenZeppelin AccessControl)
 *   Admin    : the network coordinator. Registers and removes hospitals.
 *   Hospital : a registered hospital. Can post alerts, respond to other hospitals' alerts,
 *              and close (fulfil/cancel) its own alerts.
 */
contract HospitalAlertSystem is AccessControl {
    // ---- Roles ----
    bytes32 public constant HOSPITAL_ROLE = keccak256("HOSPITAL_ROLE");

    // ---- Types ----
    enum Category { Blood, Medication, PatientTransfer }
    enum Urgency  { Normal, Urgent, Critical }
    enum Status   { None, Open, Responded, Fulfilled, Cancelled }

    struct Alert {
        uint256  id;
        Category category;
        Urgency  urgency;
        Status   status;
        string   item;          // the need, e.g. "O-negative blood, 4 units" (no patient data!)
        address  requester;     // hospital that posted the alert
        uint256  requestedAt;   // timestamps are in seconds
        address  responder;     // hospital that offered help
        uint256  respondedAt;
        string   responseNote;  // e.g. "4 units available, pickup before 14:00"
        uint256  closedAt;      // when fulfilled or cancelled
    }

    // ---- Storage ----
    uint256 public totalAlerts;        // number of alerts ever posted (also the latest id)
    uint256 public openAlertCount;     // alerts still Open or Responded
    mapping(uint256 => Alert) private alerts;
    mapping(address => string) public hospitalName;   // registry of participating hospitals

    // ---- Events (these are the tamper-evident log; apps can listen to them too) ----
    event HospitalRegistered(address indexed hospital, string name);
    event HospitalRemoved(address indexed hospital);
    event AlertRaised(uint256 indexed id, Category indexed category, Urgency urgency, string item, address indexed requester);
    event AlertResponded(uint256 indexed id, address indexed responder, uint256 responseTimeSeconds);
    event AlertFulfilled(uint256 indexed id, uint256 totalTimeSeconds);
    event AlertCancelled(uint256 indexed id);

    // ---- Modifiers ----
    modifier alertExists(uint256 id) {
        require(id >= 1 && id <= totalAlerts, "Alert not found");
        _;
    }

    // ---- Setup ----
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // deployer becomes the network admin
    }

    // ---- Admin functions ----

    /// @notice Add a hospital to the network.
    function registerHospital(address hospital, string memory name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bytes(name).length > 0, "Name required");
        _grantRole(HOSPITAL_ROLE, hospital);
        hospitalName[hospital] = name;
        emit HospitalRegistered(hospital, name);
    }

    /// @notice Remove a hospital from the network. Its past alerts stay on record.
    function removeHospital(address hospital) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(HOSPITAL_ROLE, hospital);
        emit HospitalRemoved(hospital);
    }

    // ---- Core logic ----

    /// @notice A hospital posts an urgent need. Returns the new alert's id.
    function raiseAlert(Category category, Urgency urgency, string memory item)
        external onlyRole(HOSPITAL_ROLE) returns (uint256)
    {
        require(bytes(item).length > 0, "Item description required");

        totalAlerts += 1;
        openAlertCount += 1;
        uint256 id = totalAlerts;

        Alert storage a = alerts[id];
        a.id          = id;
        a.category    = category;
        a.urgency     = urgency;
        a.status      = Status.Open;
        a.item        = item;
        a.requester   = msg.sender;
        a.requestedAt = block.timestamp;

        emit AlertRaised(id, category, urgency, item, msg.sender);
        return id;
    }

    /// @notice A DIFFERENT hospital offers help. The response time is saved on-chain.
    function respondToAlert(uint256 id, string memory note) external onlyRole(HOSPITAL_ROLE) alertExists(id) {
        Alert storage a = alerts[id];
        require(a.status == Status.Open, "Alert is not open");
        require(a.requester != msg.sender, "Cannot respond to your own alert");

        a.status       = Status.Responded;
        a.responder    = msg.sender;
        a.respondedAt  = block.timestamp;
        a.responseNote = note;

        emit AlertResponded(id, msg.sender, block.timestamp - a.requestedAt);
    }

    /// @notice The requesting hospital confirms the need was met.
    function fulfilAlert(uint256 id) external onlyRole(HOSPITAL_ROLE) alertExists(id) {
        Alert storage a = alerts[id];
        require(a.requester == msg.sender, "Only the requester can close");
        require(a.status == Status.Responded, "Needs a response first");

        a.status   = Status.Fulfilled;
        a.closedAt = block.timestamp;
        openAlertCount -= 1;

        emit AlertFulfilled(id, block.timestamp - a.requestedAt);
    }

    /// @notice The requesting hospital withdraws the alert (no longer needed).
    function cancelAlert(uint256 id) external onlyRole(HOSPITAL_ROLE) alertExists(id) {
        Alert storage a = alerts[id];
        require(a.requester == msg.sender, "Only the requester can close");
        require(a.status == Status.Open || a.status == Status.Responded, "Alert already closed");

        a.status   = Status.Cancelled;
        a.closedAt = block.timestamp;
        openAlertCount -= 1;

        emit AlertCancelled(id);
    }

    // ---- Read functions ----

    /// @notice The full record of one alert (the audit trail).
    function getAlert(uint256 id) external view alertExists(id) returns (Alert memory) {
        return alerts[id];
    }

    /// @notice Ids of all alerts that are still Open or Responded.
    function getOpenAlertIds() external view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](openAlertCount);
        uint256 found = 0;
        for (uint256 i = 1; i <= totalAlerts; i++) {
            if (alerts[i].status == Status.Open || alerts[i].status == Status.Responded) {
                ids[found] = i;
                found += 1;
            }
        }
        return ids;
    }
}
