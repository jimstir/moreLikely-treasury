import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.SEPOLIA_RPC_URL || "https://gateway.tenderly.co/public/sepolia",
      },
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://gateway.tenderly.co/public/sepolia",
      accounts: [
        process.env.OWNER_PRIVATE_KEY,
        process.env.STAKEHOLDER_PRIVATE_KEY,
        process.env.AI_AGENT_PRIVATE_KEY
      ].filter((x): x is string => !!x)
    }
  },
};

export default config;
