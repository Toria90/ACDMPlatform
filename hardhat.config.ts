import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

import { HardhatUserConfig } from "hardhat/types";

import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "solidity-coverage";
import '@typechain/hardhat'
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";

const INFURA_URL = process.env.INFURA_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.4.18"
            },
            {
                version: "0.5.0"
            },
            {
                version: "0.5.16"
            },
            {
                version: "0.6.2"
            },
            {
                version: "0.6.6"
            },
            {
                version: "0.8.9"
            }
        ]
    },
    networks:{
        test:{
            url: INFURA_URL,
            accounts: [`0x${PRIVATE_KEY}`]
        }
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY,
    }
};

export default config;