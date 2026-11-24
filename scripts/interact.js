// Usage: npx hardhat run scripts/interact.js --network sepolia
// Walks through a full inter-hospital request: register -> raise -> respond -> fulfil -> read audit record.
// Needs PRIVATE_KEY (admin + requesting hospital) and PRIVATE_KEY_2 (responding hospital) in .env.
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const { address } = JSON.parse(fs.readFileSync("deployed-address.json"));
  const [hospA, hospB] = await hre.ethers.getSigners();
  if (!hospB) throw new Error("Add PRIVATE_KEY_2 to .env (a second funded test wallet) to demo a response.");
  const c = await hre.ethers.getContractAt("HospitalAlertSystem", address, hospA);
  console.log("Contract:", address, "\nHospital A (admin, requester):", hospA.address, "\nHospital B (responder):", hospB.address, "\n");

  const send = async (label, txPromise) => {
    const tx = await txPromise; const r = await tx.wait();
    console.log(`OK  ${label}\n    tx: ${tx.hash}  (block ${r.blockNumber}, gas ${r.gasUsed})`);
  };
  const HOSPITAL = await c.HOSPITAL_ROLE();

  // 1. Admin registers both hospitals (skipped if already registered)
  if (!(await c.hasRole(HOSPITAL, hospA.address))) await send("registerHospital(A)", c.registerHospital(hospA.address, "Kimironko District Hospital"));
  if (!(await c.hasRole(HOSPITAL, hospB.address))) await send("registerHospital(B)", c.registerHospital(hospB.address, "CHUK Referral Hospital"));

  // 2. Hospital A posts a critical blood request (Category 0 = Blood, Urgency 2 = Critical)
  await send("A: raiseAlert(Blood, Critical)", c.raiseAlert(0, 2, "O-negative blood, 4 units"));
  const id = await c.totalAlerts();
  console.log("    new alert id:", id.toString());

  // 3. Hospital B responds
  await send("B: respondToAlert", c.connect(hospB).respondToAlert(id, "4 units available, ready for pickup"));

  // 4. Hospital A confirms it was fulfilled
  await send("A: fulfilAlert", c.fulfilAlert(id));

  // 5. Read the audit record
  const a = await c.getAlert(id);
  console.log("\nAudit record:");
  console.log({ id: a.id.toString(), item: a.item, status: Number(a.status), requester: a.requester, requestedAt: a.requestedAt.toString(),
    responder: a.responder, respondedAt: a.respondedAt.toString(), responseNote: a.responseNote, closedAt: a.closedAt.toString() });
  console.log("Open alerts now:", (await c.openAlertCount()).toString());
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
