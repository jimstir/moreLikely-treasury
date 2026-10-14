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

    describe("Audit Report 1 Remediation: Chainlink Staleness & Uniswap TWAP", function () {
        let mockAggregator: any;
        let mockPool: any;
        let token0: any;
        let token1: any;

        beforeEach(async function () {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            token0 = await MockERC20.deploy("Token0", "TK0");
            await token0.waitForDeployment();
            token1 = await MockERC20.deploy("Token1", "TK1");
            await token1.waitForDeployment();

            // Ensure address ordering token0 < token1
            if ((await token0.getAddress()).toLowerCase() > (await token1.getAddress()).toLowerCase()) {
                const temp = token0;
                token0 = token1;
                token1 = temp;
            }

            const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
            mockAggregator = await MockAggregatorV3.deploy(8, 200000000000); // 2000 USD (8 decimals)
            await mockAggregator.waitForDeployment();

            const MockUniswapV3Pool = await ethers.getContractFactory("MockUniswapV3Pool");
            mockPool = await MockUniswapV3Pool.deploy(
                await token0.getAddress(),
                await token1.getAddress()
            );
            await mockPool.waitForDeployment();
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #18
         * @description Chainlink oracle price consumption lacks round integrity and staleness checks.
         */
        describe("[Finding #18] Chainlink Staleness & Round Sequencing", function () {
            beforeEach(async function () {
                await oracleRouter.registerChainlinkFeed(await mockAggregator.getAddress());
            });

            it("should revert with 'Invalid oracle price' when price <= 0", async function () {
                const block = await ethers.provider.getBlock("latest");
                const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
                await mockAggregator.setRoundData(1, 0, now, 1);

                await expect(
                    oracleRouter.getPrice(await mockAggregator.getAddress())
                ).to.be.revertedWith("Invalid oracle price");

                await mockAggregator.setRoundData(1, -100, now, 1);
                await expect(
                    oracleRouter.getPrice(await mockAggregator.getAddress())
                ).to.be.revertedWith("Invalid oracle price");
            });

            it("should revert with 'Incomplete round' when updatedAt == 0", async function () {
                await mockAggregator.setRoundData(1, 200000000000, 0, 1);

                await expect(
                    oracleRouter.getPrice(await mockAggregator.getAddress())
                ).to.be.revertedWith("Incomplete round");
            });

            it("should revert with 'Stale price round' when answeredInRound < roundId", async function () {
                const block = await ethers.provider.getBlock("latest");
                const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
                await mockAggregator.setRoundData(5, 200000000000, now, 4);

                await expect(
                    oracleRouter.getPrice(await mockAggregator.getAddress())
                ).to.be.revertedWith("Stale price round");
            });

            it("should revert with 'Future price timestamp' when updatedAt > block.timestamp", async function () {
                const block = await ethers.provider.getBlock("latest");
                const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
                await mockAggregator.setRoundData(1, 200000000000, now + 1000, 1);

                await expect(
                    oracleRouter.getPrice(await mockAggregator.getAddress())
                ).to.be.revertedWith("Future price timestamp");
            });

            it("should revert with 'Price is stale' when maxAge threshold is exceeded", async function () {
                const block = await ethers.provider.getBlock("latest");
                const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
                await mockAggregator.setRoundData(1, 200000000000, now - 4000, 1);

                // getPrice(market, maxAge) with maxAge = 3600
                await expect(
                    oracleRouter["getPrice(address,uint256)"](await mockAggregator.getAddress(), 3600)
                ).to.be.revertedWith("Price is stale");
            });

            it("should succeed and scale decimals accurately to 1e18 when all round checks pass", async function () {
                const block = await ethers.provider.getBlock("latest");
                const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
                await mockAggregator.setRoundData(1, 200000000000, now, 1); // 2000 * 1e8

                const price = await oracleRouter["getPrice(address,uint256)"](await mockAggregator.getAddress(), 3600);
                expect(price).to.equal(ethers.parseEther("2000"));
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #19
         * @description Uniswap TWAP tick is truncated to int24 without range checks before TickMath.
         */
        describe("[Finding #19] Uniswap TWAP Tick Bound Checks", function () {
            const twapPeriod = 10;

            beforeEach(async function () {
                await oracleRouter.registerUniswapPool(
                    await mockPool.getAddress(),
                    await token0.getAddress(),
                    twapPeriod
                );
            });

            it("should revert with 'TWAP tick out of bounds' when delta exceeds TickMath.MAX_TICK", async function () {
                // MAX_TICK is 887272. Let delta = 887273
                const delta = 887273n;
                const c0 = 0n;
                const c1 = delta * BigInt(twapPeriod);
                await mockPool.setTickCumulatives(c0, c1);

                await expect(
                    oracleRouter.getPrice(await mockPool.getAddress())
                ).to.be.revertedWith("TWAP tick out of bounds");
            });

            it("should revert with 'TWAP tick out of bounds' when delta is below TickMath.MIN_TICK", async function () {
                // MIN_TICK is -887272. Let delta = -887273
                const delta = -887273n;
                const c0 = 0n;
                const c1 = delta * BigInt(twapPeriod);
                await mockPool.setTickCumulatives(c0, c1);

                await expect(
                    oracleRouter.getPrice(await mockPool.getAddress())
                ).to.be.revertedWith("TWAP tick out of bounds");
            });

            it("should calculate valid TWAP price for normal tick within bounds", async function () {
                // Delta = 1000, within bounds [-887272, 887272]
                const delta = 1000n;
                const c0 = 0n;
                const c1 = delta * BigInt(twapPeriod);
                await mockPool.setTickCumulatives(c0, c1);

                const price = await oracleRouter.getPrice(await mockPool.getAddress());
                expect(price).to.be.gt(0);
            });
        });
    });
});
