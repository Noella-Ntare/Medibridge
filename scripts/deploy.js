// Usage: npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  const Factory = await hre.ethers.getContractFactory("HospitalAlertSystem");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("HospitalAlertSystem deployed to:", address);
  console.log("Tx hash:", contract.deploymentTransaction().hash);

  fs.writeFileSync("deployed-address.json", JSON.stringify({ network: hre.network.name, address }, null, 2));
  console.log("Saved to deployed-address.json");
  console.log(`\nVerify with:\n  npx hardhat verify --network ${hre.network.name} ${address}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
