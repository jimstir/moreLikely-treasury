import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("Live Sepolia Fork OracleRouter Test Suite", function () {
    let owner: Signer;
    let oracleRouter: any;

    const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
    const UNISWAP_WETH_USDC_500 = "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1";
    const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
    const TWAP_PERIOD = 10; // 10 seconds

    before(async function () {
        // Only run on Sepolia or Sepolia Fork
        const network = await ethers.provider.getNetwork();
        if (network.chainId !== 11155111n && network.chainId !== 31337n) {
            console.warn("Skipping tests: Not on Sepolia or Local Fork.");
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

    it("should register and fetch Chainlink ETH/USD price", async function () {
        await oracleRouter.registerChainlinkFeed(CHAINLINK_ETH_USD);
        
        // Assert it registered correctly
        expect(await oracleRouter.marketTypes(CHAINLINK_ETH_USD)).to.equal(1n); // MarketType.CHAINLINK = 1

        const price = await oracleRouter.getPrice(CHAINLINK_ETH_USD);
        
        expect(price).to.be.gt(0);
        console.log(`          [SUCCESS] Chainlink ETH/USD Price (scaled 1e18): ${price.toString()}`);
    });

    it("should register and fetch Uniswap V3 WETH/USDC TWAP price", async function () {
        await oracleRouter.registerUniswapPool(UNISWAP_WETH_USDC_500, WETH_ADDRESS, TWAP_PERIOD);
        
        // Assert it registered correctly
        expect(await oracleRouter.marketTypes(UNISWAP_WETH_USDC_500)).to.equal(2n); // MarketType.UNISWAP = 2
        expect(await oracleRouter.pricedTokens(UNISWAP_WETH_USDC_500)).to.equal(WETH_ADDRESS);
        expect(await oracleRouter.twapPeriods(UNISWAP_WETH_USDC_500)).to.equal(TWAP_PERIOD);

        // Fetch price
        const price = await oracleRouter.getPrice(UNISWAP_WETH_USDC_500);
        
        expect(price).to.be.gt(0);
        console.log(`          [SUCCESS] Uniswap WETH/USDC TWAP Price (scaled 1e18): ${price.toString()}`);
    });

    it("should revert if fetching price for unregistered market", async function () {
        const UNREGISTERED = "0x0000000000000000000000000000000000001234";
        await expect(
            oracleRouter.getPrice(UNREGISTERED)
        ).to.be.revertedWith("Market not registered");
    });
});
