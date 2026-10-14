import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("LendingPolicy - Oracle LTV & Wind-Down Suite", function () {
    let owner: Signer;
    let borrower: Signer;

    let ownerAddress: string;
    let borrowerAddress: string;

    let weth: any;
    let usdc: any;
    let initToken: any;
    let treasuryToken: any;
    let treasuryVault: any;
    let oracleRouter: any;
    let lendingPolicy: any;

    let wethFeed: any;
    let usdcFeed: any;

    beforeEach(async function () {
        [owner, borrower] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        borrowerAddress = await borrower.getAddress();

        // 1. Deploy Tokens: WETH (18 dec), USDC (18 dec in mock), INIT
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        weth = await MockERC20.deploy("Wrapped Ether", "WETH");
        await weth.waitForDeployment();
        usdc = await MockERC20.deploy("USD Coin", "USDC");
        await usdc.waitForDeployment();
        initToken = await MockERC20.deploy("Init Token", "INIT");
        await initToken.waitForDeployment();

        // 2. Deploy TreasuryToken and TreasuryVault
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy("Treasury Shares", "TRES", ownerAddress);
        await treasuryToken.waitForDeployment();

        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
        treasuryVault = await TreasuryVault.deploy(
            "moreLikely Treasury",
            await treasuryToken.getAddress(),
            await initToken.getAddress(),
            100,
            "Vault Shares",
            "VSHARE"
        );
        await treasuryVault.waitForDeployment();
        await (await treasuryToken.setVault(await treasuryVault.getAddress())).wait();

        // Add USDC and WETH to vault
        for (const token of [usdc, weth]) {
            const tx = await treasuryVault.proposalOpen(
                0,
                ethers.ZeroAddress,
                ownerAddress,
                2,
                await token.getAddress()
            );
            await tx.wait();
            const pId = await treasuryVault.proposalNum();
            await (await treasuryVault.newToken(await token.getAddress(), pId)).wait();
        }

        // 3. Deploy OracleRouter and Mock Feeds
        const OracleRouter = await ethers.getContractFactory("OracleRouter");
        oracleRouter = await OracleRouter.deploy(ownerAddress);
        await oracleRouter.waitForDeployment();

        const MockAggregatorV3 = await ethers.getContractFactory("MockAggregatorV3");
        // WETH price = $3,000 (8 decimals = 3000 * 1e8)
        wethFeed = await MockAggregatorV3.deploy(8, 300000000000);
        await wethFeed.waitForDeployment();
        // USDC price = $1 (8 decimals = 1 * 1e8)
        usdcFeed = await MockAggregatorV3.deploy(8, 100000000);
        await usdcFeed.waitForDeployment();

        await oracleRouter.registerChainlinkFeed(await wethFeed.getAddress());
        await oracleRouter.registerChainlinkFeed(await usdcFeed.getAddress());

        // 4. Deploy LendingPolicy
        const LendingPolicy = await ethers.getContractFactory("LendingPolicy");
        lendingPolicy = await LendingPolicy.deploy(await treasuryVault.getAddress());
        await lendingPolicy.waitForDeployment();

        // Configure oracle router and markets in LendingPolicy
        await lendingPolicy.setOracleRouter(await oracleRouter.getAddress());
        await lendingPolicy.setTokenOracleMarket(await weth.getAddress(), await wethFeed.getAddress());
        await lendingPolicy.setTokenOracleMarket(await usdc.getAddress(), await usdcFeed.getAddress());

        // Configure collateral token: WETH
        await lendingPolicy.setAcceptedCollateral(await weth.getAddress(), true, 1);

        // Fund lending liquidity in policy: 100,000 USDC
        await (await usdc.mint(await lendingPolicy.getAddress(), ethers.parseEther("100000"))).wait();

        // Mint WETH collateral to borrower
        await (await weth.mint(borrowerAddress, ethers.parseEther("10"))).wait();
        await (await weth.connect(borrower).approve(await lendingPolicy.getAddress(), ethers.parseEther("10"))).wait();
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #7
     * @description Oracle-based valuation for multi-asset LTV calculations in LendingPolicy.
     */
    describe("[Finding #7] Multi-Asset Oracle-Based LTV (takeLoan)", function () {
        it("should calculate borrow power based on Oracle USD valuation rather than 1:1 units", async function () {
            // Borrower deposits 1 WETH collateral ($3,000 value).
            // At 75% maxLTV (default), borrow power is $3,000 * 75% = $2,250 = 2,250 USDC.
            await lendingPolicy.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("1"));

            // If it were 1:1 token units, borrowing 2,000 USDC against 1 WETH would revert.
            // But with Oracle pricing, 2,000 USDC ($2,000) <= 2,250 USDC ($2,250 limit), so it must succeed.
            const borrowAmount = ethers.parseEther("2000");
            await expect(
                lendingPolicy.connect(borrower).takeLoan(await usdc.getAddress(), borrowAmount)
            ).to.not.be.reverted;

            expect(await usdc.balanceOf(borrowerAddress)).to.equal(borrowAmount);
            const loan = await lendingPolicy.loans(borrowerAddress);
            expect(loan.loanAmount).to.equal(borrowAmount);
        });

        it("should revert with 'Exceeds Maximum LTV' when requested borrow exceeds Oracle LTV limit", async function () {
            // 1 WETH = $3,000. 75% LTV = $2,250 limit.
            await lendingPolicy.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("1"));

            // Borrowing 2,500 USDC exceeds 2,250 USDC limit
            const excessiveBorrow = ethers.parseEther("2500");
            await expect(
                lendingPolicy.connect(borrower).takeLoan(await usdc.getAddress(), excessiveBorrow)
            ).to.be.revertedWith("Exceeds Maximum LTV");
        });

        it("should fail closed (revert) if oracle market is unconfigured or price is invalid", async function () {
            await lendingPolicy.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("1"));

            // Set WETH feed to return 0 price
            const block = await ethers.provider.getBlock("latest");
            const now = block ? block.timestamp : Math.floor(Date.now() / 1000);
            await wethFeed.setRoundData(1, 0, now, 1);

            await expect(
                lendingPolicy.connect(borrower).takeLoan(await usdc.getAddress(), ethers.parseEther("100"))
            ).to.be.revertedWith("Oracle call failed");
        });

        it("should validate public view helpers getTokenValue and getMaxBorrow", async function () {
            // getTokenValue(WETH, 2) = 2 * $3,000 = $6,000 (scaled 1e18)
            const wethVal = await lendingPolicy.getTokenValue(await weth.getAddress(), ethers.parseEther("2"));
            expect(wethVal).to.equal(ethers.parseEther("6000"));

            // Deposit 2 WETH ($6,000). At 75% maxLTV, max borrow in USDC ($1) = 4,500 USDC
            await lendingPolicy.connect(borrower).depositCollateral(await weth.getAddress(), ethers.parseEther("2"));

            const maxBorrow = await lendingPolicy.getMaxBorrow(borrowerAddress, await usdc.getAddress());
            expect(maxBorrow).to.equal(ethers.parseEther("4500"));
        });
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #20
     * @description Wind-down liquidation sweeps idle assets to vault via depositTreasury(..., false, 0).
     */
    describe("[Finding #20] Wind-Down Liquidation Sweep", function () {
        it("should liquidate and sweep idle token balances back to TreasuryVault", async function () {
            // Send 500 USDC directly to policy
            await (await usdc.mint(await lendingPolicy.getAddress(), ethers.parseEther("500"))).wait();

            // Trigger liquidate()
            await lendingPolicy.liquidate();
            expect(await lendingPolicy.status()).to.equal(1);

            const vaultUsdcBefore = await usdc.balanceOf(await treasuryVault.getAddress());
            const policyUsdcBalance = await usdc.balanceOf(await lendingPolicy.getAddress());

            // Sweep USDC back to vault
            await expect(
                lendingPolicy.liquidateToken(await usdc.getAddress())
            ).to.not.be.reverted;

            const vaultUsdcAfter = await usdc.balanceOf(await treasuryVault.getAddress());
            expect(vaultUsdcAfter - vaultUsdcBefore).to.equal(policyUsdcBalance);
            expect(await usdc.balanceOf(await lendingPolicy.getAddress())).to.equal(0);
        });
    });
});
