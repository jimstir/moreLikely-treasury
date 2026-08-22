import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("Live Sepolia Testnet OracleRouter Test Suite", function () {
    let owner: Signer;
    let oracleRouter: any;

    const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    const UNISWAP_WETH_USDC_500 = "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1";
    const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
    const TWAP_PERIOD = 10; // 10 seconds

    before(async function () {
        // We only want this to run on Sepolia testnet explicitly
        const network = await ethers.provider.getNetwork();
        if (network.chainId !== 11155111n) {
            console.warn("Skipping tests: Not on Live Sepolia Testnet.");
            this.skip();
        }
    });

    beforeEach(async function () {
        [owner] = await ethers.getSigners();
        const ownerAddress = await owner.getAddress();

        const OracleRouter = await ethers.getContractFactory("OracleRouter");
        oracleRouter = await OracleRouter.deploy(ownerAddress);
        await oracleRouter.waitForDeployment();
    });

    it("should register and fetch Chainlink ETH/USD price on live network", async function () {
        const tx = await oracleRouter.registerChainlinkFeed(CHAINLINK_ETH_USD);
        await tx.wait(); // Wait for confirmation on live network

        // Assert it registered correctly
        expect(await oracleRouter.marketTypes(CHAINLINK_ETH_USD)).to.equal(1n); 

        const price = await oracleRouter.getPrice(CHAINLINK_ETH_USD);
        
        expect(price).to.be.gt(0);
        console.log(`          [SUCCESS] Live Chainlink ETH/USD Price (scaled 1e18): ${price.toString()}`);
    });

    it("should register and fetch Uniswap V3 WETH/USDC TWAP price on live network", async function () {
        const tx = await oracleRouter.registerUniswapPool(UNISWAP_WETH_USDC_500, WETH_ADDRESS, TWAP_PERIOD);
        await tx.wait(); // Wait for confirmation
        
        // Assert it registered correctly
        expect(await oracleRouter.marketTypes(UNISWAP_WETH_USDC_500)).to.equal(2n); 

        // Fetch price
        const price = await oracleRouter.getPrice(UNISWAP_WETH_USDC_500);
        
        expect(price).to.be.gt(0);
        console.log(`          [SUCCESS] Live Uniswap WETH/USDC TWAP Price (scaled 1e18): ${price.toString()}`);
    });
});
