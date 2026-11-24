# MediBridge: Deployment & Interaction Guide

An Ethereum smart contract (`contracts/HospitalAlertSystem.sol`) where registered hospitals in Kigali post and
answer urgent **blood, medication and patient-transfer** requests, with a tamper-evident record of every step.
(Ethereum implementation of the MediChain concept.)

## 1. Prerequisites
- Node.js 18+ (`node -v`)
- MetaMask with **two new test-only accounts** (Hospital A = admin + requester, Hospital B = responder)
- Sepolia test ETH in both accounts (Google Cloud Web3 faucet or Alchemy faucet)
- An RPC URL from Infura or Alchemy (free account → create a Sepolia project)
- (Optional) Etherscan API key for verification

## 2. Setup
```bash
npm install --legacy-peer-deps
cp .env.example .env     # fill in SEPOLIA_RPC_URL, PRIVATE_KEY (Hospital A), PRIVATE_KEY_2 (Hospital B)
```
MetaMask → account menu → Account details → Show private key (test accounts only, never real funds).

## 3. Compile & test locally
```bash
npx hardhat compile
npx hardhat test          # expect: 18 passing
npx hardhat coverage      # optional
```
Screenshot: the `18 passing` output.

## 4. Deploy to Sepolia
```bash
npx hardhat run scripts/deploy.js --network sepolia
```
Prints the contract address and tx hash; saves the address to `deployed-address.json`.
Screenshot: terminal AND https://sepolia.etherscan.io/address/<ADDRESS>.

## 5. Verify source on Etherscan (optional)
```bash
npx hardhat verify --network sepolia <ADDRESS>
```

## 6. Interact
**Scripted run** (register hospitals → A raises blood alert → B responds → A marks fulfilled → read record):
```bash
npx hardhat run scripts/interact.js --network sepolia
```
Screenshot: terminal output and the Transactions tab on Etherscan.

**Manually** with `npx hardhat console --network sepolia`:
```js
const c = await ethers.getContractAt("HospitalAlertSystem", "<ADDRESS>");
await c.registerHospital("0xHospitalAddress", "CHUK Referral Hospital");
await c.raiseAlert(0, 2, "O-negative blood, 4 units");
await c.getAlert(1);
await c.getOpenAlertIds();
```
Enums: Category 0=Blood 1=Medication 2=PatientTransfer · Urgency 0=Normal 1=Urgent 2=Critical · Status 1=Open 2=Responded 3=Fulfilled 4=Cancelled.

## 7. Dashboard (optional)
```bash
cd frontend && python3 -m http.server 8000     # open http://localhost:8000
```
**Demo mode** runs with no wallet (simulated). For the real thing: Connect wallet (Sepolia) → paste contract address → Load.

## 8. Troubleshooting
| Problem | Fix |
|---|---|
| `insufficient funds` | Get more Sepolia ETH for that wallet |
| HH8 / invalid account | Key missing or malformed in `.env` (no `0x`, no spaces) |
| `Add PRIVATE_KEY_2` error | Interact script needs the second hospital wallet |
| Compiler download fails | Prefix commands with `USE_LOCAL_SOLC=true` |
