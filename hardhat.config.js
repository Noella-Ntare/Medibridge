require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

// Optional: use the bundled solc-js instead of downloading a compiler
// (only needed on networks that block binaries.soliditylang.org).
if (process.env.USE_LOCAL_SOLC === "true") {
  subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args) => {
    const solc = require("solc");
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: solc.version().split(".Emscripten")[0],
    };
  });
}

const { SEPOLIA_RPC_URL = "", PRIVATE_KEY = "", PRIVATE_KEY_2 = "", ETHERSCAN_API_KEY = "" } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [PRIVATE_KEY, PRIVATE_KEY_2].filter(Boolean),
    },
  },
  etherscan: { apiKey: ETHERSCAN_API_KEY },
  gasReporter: { enabled: process.env.REPORT_GAS === "true" },
};
