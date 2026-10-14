import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("Exit Policies & Supply Burning Test Suite", function () {
    let owner: Signer;
    let user1: Signer;
    let manager: Signer;
    let outsider: Signer;

    let ownerAddress: string;
    let user1Address: string;
    let managerAddress: string;

    let usdc: any;
    let initToken: any;
    let treasuryToken: any;
    let treasuryVault: any;

    beforeEach(async function () {
        [owner, user1, manager, outsider] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        user1Address = await user1.getAddress();
        managerAddress = await manager.getAddress();

        // 1. Deploy Mock ERC20 Tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("Mock USDC", "USDC");
        await usdc.waitForDeployment();
        initToken = await MockERC20.deploy("Init Token", "INIT");
        await initToken.waitForDeployment();

        // 2. Deploy TreasuryToken
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy(
            "Treasury Shares",
            "TRES",
            ownerAddress
        );
        await treasuryToken.waitForDeployment();

        // 3. Deploy TreasuryVault
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

        // Link TreasuryToken to TreasuryVault
        await (await treasuryToken.setVault(await treasuryVault.getAddress())).wait();

        // Add USDC as approved token
        const tx = await treasuryVault.proposalOpen(
            0,
            ethers.ZeroAddress,
            ownerAddress,
            2, // ADD_TOKEN
            await usdc.getAddress()
        );
        await tx.wait();
        const pId = await treasuryVault.proposalNum();
        await (await treasuryVault.newToken(await usdc.getAddress(), pId)).wait();

        // Mint USDC to user1, approve, and join treasury to get treasuryToken
        await (await usdc.mint(user1Address, ethers.parseEther("1000"))).wait();
        await (await usdc.connect(user1).approve(await treasuryVault.getAddress(), ethers.parseEther("1000"))).wait();
        await (await treasuryVault.connect(user1).joinTreasury(await usdc.getAddress(), ethers.parseEther("1000"))).wait();
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #5 & Finding #6
     * @description Exit contracts must payout exitToken (e.g. USDC), never treasToken (the vault share/underlying).
     */
    describe("[Finding #5 & #6] Distinct exitToken Asset Payout", function () {
        let dissolutionExit: any;
        const swapRatio = ethers.parseEther("1"); // 1:1 swap ratio

        beforeEach(async function () {
            const block = await ethers.provider.getBlock("latest");
            const exitWindowEnd = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 86400;

            const DissolutionExit = await ethers.getContractFactory("DissolutionExit");
            dissolutionExit = await DissolutionExit.deploy(
                await treasuryVault.getAddress(),
                await usdc.getAddress(),
                1,
                swapRatio,
                exitWindowEnd
            );
            await dissolutionExit.waitForDeployment();

            // Fund the exit contract with USDC exit tokens
            await (await usdc.mint(await dissolutionExit.getAddress(), ethers.parseEther("500"))).wait();
        });

        it("should payout exitToken and not the ERC4626 vault share / treasToken", async function () {
            const exitAmount = ethers.parseEther("100");
            const userUsdcBefore = await usdc.balanceOf(user1Address);
            const userTreasTokenBefore = await treasuryToken.balanceOf(user1Address);

            await dissolutionExit.connect(user1).claimExit(exitAmount);

            const userUsdcAfter = await usdc.balanceOf(user1Address);
            const userTreasTokenAfter = await treasuryToken.balanceOf(user1Address);

            // User received exitToken (USDC)
            expect(userUsdcAfter - userUsdcBefore).to.equal(exitAmount);
            // User did NOT receive any treasToken, their treasToken decreased by exitAmount
            expect(userTreasTokenBefore - userTreasTokenAfter).to.equal(exitAmount);
        });

        it("should calculate claimant payout according to swapRatio pro-rata", async function () {
            // Deploy with 2:1 swap ratio (each 1 treasuryToken gets 2 exitTokens)
            const block = await ethers.provider.getBlock("latest");
            const exitWindowEnd = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 86400;

            const DissolutionExit = await ethers.getContractFactory("DissolutionExit");
            const ratioExit = await DissolutionExit.deploy(
                await treasuryVault.getAddress(),
                await usdc.getAddress(),
                1,
                ethers.parseEther("2"), // 2x ratio
                exitWindowEnd
            );
            await ratioExit.waitForDeployment();

            await (await usdc.mint(await ratioExit.getAddress(), ethers.parseEther("500"))).wait();

            const exitAmount = ethers.parseEther("50");
            const userUsdcBefore = await usdc.balanceOf(user1Address);

            await ratioExit.connect(user1).claimExit(exitAmount);

            const userUsdcAfter = await usdc.balanceOf(user1Address);
            expect(userUsdcAfter - userUsdcBefore).to.equal(ethers.parseEther("100")); // 50 * 2 = 100
        });
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #11 & Finding #12
     * @description Native supply burning via burnTreasury reduces totalSupply without transferring to 0xdead.
     */
    describe("[Finding #11 & #12] Native Supply Burning via burnTreasury", function () {
        let dissolutionExit: any;

        beforeEach(async function () {
            const block = await ethers.provider.getBlock("latest");
            const exitWindowEnd = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 86400;

            const DissolutionExit = await ethers.getContractFactory("DissolutionExit");
            dissolutionExit = await DissolutionExit.deploy(
                await treasuryVault.getAddress(),
                await usdc.getAddress(),
                1,
                ethers.parseEther("1"),
                exitWindowEnd
            );
            await dissolutionExit.waitForDeployment();

            await (await usdc.mint(await dissolutionExit.getAddress(), ethers.parseEther("500"))).wait();
        });

        it("should reduce user balance and totalSupply via burnTreasury, keeping 0xdead balance zero", async function () {
            const exitAmount = ethers.parseEther("75");
            const deadAddress = "0x000000000000000000000000000000000000dEaD";

            const userBalBefore = await treasuryToken.balanceOf(user1Address);
            const totalSupBefore = await treasuryToken.totalSupply();

            await dissolutionExit.connect(user1).claimExit(exitAmount);

            const userBalAfter = await treasuryToken.balanceOf(user1Address);
            const totalSupAfter = await treasuryToken.totalSupply();
            const deadBal = await treasuryToken.balanceOf(deadAddress);

            expect(userBalBefore - userBalAfter).to.equal(exitAmount);
            expect(totalSupBefore - totalSupAfter).to.equal(exitAmount);
            expect(deadBal).to.equal(0);
        });

        it("should revert if an unauthorized contract or address attempts to call burnTreasury", async function () {
            await expect(
                treasuryToken.connect(outsider).burnTreasury(user1Address, ethers.parseEther("10"))
            ).to.be.reverted;
        });
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #8
     * @description Dissolution settlement checks verify all proposals closed and owed funds returned.
     */
    describe("[Finding #8 Synergy] Dissolution Settlement Checks", function () {
        let dissolutionExit: any;

        beforeEach(async function () {
            const block = await ethers.provider.getBlock("latest");
            const exitWindowEnd = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 86400;

            const DissolutionExit = await ethers.getContractFactory("DissolutionExit");
            dissolutionExit = await DissolutionExit.deploy(
                await treasuryVault.getAddress(),
                await usdc.getAddress(),
                999, // dummy exit proposal num
                ethers.parseEther("1"),
                exitWindowEnd
            );
            await dissolutionExit.waitForDeployment();
            await (await usdc.mint(await dissolutionExit.getAddress(), ethers.parseEther("500"))).wait();
        });

        it("should return true when all proposals are closed and owed is 0 (including overpaid proposals)", async function () {
            // Close proposal 1 (ADD_TOKEN proposal from beforeEach)
            await (await treasuryVault.proposalClose(1)).wait();

            // Open and close a proposal with full repayment
            await (await treasuryVault.proposalOpen(
                ethers.parseEther("50"),
                await dissolutionExit.getAddress(),
                ownerAddress,
                3, // EXIT
                await usdc.getAddress()
            )).wait();
            const pId = await treasuryVault.proposalNum();
            await (await treasuryVault.proposalClose(pId)).wait();

            // Repay proposal fully (overpay with 60)
            await (await usdc.mint(ownerAddress, ethers.parseEther("60"))).wait();
            await (await usdc.approve(await treasuryVault.getAddress(), ethers.parseEther("60"))).wait();
            await (await treasuryVault.depositTreasury(await usdc.getAddress(), ethers.parseEther("60"), true, pId)).wait();

            expect(await dissolutionExit.verifyAllProposalsClosedAndReturned()).to.be.true;
        });

        it("should revert claimExit if any open proposals remain", async function () {
            // Open proposal that remains unclosed
            await (await treasuryVault.proposalOpen(
                ethers.parseEther("50"),
                await dissolutionExit.getAddress(),
                ownerAddress,
                3,
                await usdc.getAddress()
            )).wait();

            await expect(
                dissolutionExit.connect(user1).claimExit(ethers.parseEther("10"))
            ).to.be.revertedWith("Treasury not fully dissolved or funds outstanding");
        });
    });

    /**
     * @audit pashov-ai-audit-report-1.md
     * @description PortionalExit and StrategyExit eligibility snapshots, manager fee deductions, and ImmutableExit restrictions.
     */
    describe("Portional, Strategy & Immutable Exit Controls", function () {
        it("PortionalExit: should enforce snapshot balance limits and decrement remaining quota", async function () {
            const PortionalExit = await ethers.getContractFactory("PortionalExit");
            const portionalExit = await PortionalExit.deploy(
                await treasuryVault.getAddress(),
                await usdc.getAddress(),
                ownerAddress
            );
            await portionalExit.waitForDeployment();
            await (await usdc.mint(await portionalExit.getAddress(), ethers.parseEther("500"))).wait();

            const block = await ethers.provider.getBlock("latest");
            const exitWindowEnd = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 86400;

            // Start round and snapshot user1 with 50 eligible shares
            await portionalExit.startExitPeriod(
                1,
                ethers.parseEther("1"),
                exitWindowEnd,
                [user1Address],
                [ethers.parseEther("50")]
            );

            // Attempting to claim 60 exceeds snapshot limit of 50
            await expect(
                portionalExit.connect(user1).claimExit(ethers.parseEther("60"))
            ).to.be.revertedWith("Exceeds eligible balance");

            // Claim 30 successfully
            await portionalExit.connect(user1).claimExit(ethers.parseEther("30"));
            expect(await portionalExit.eligibleShares(1, user1Address)).to.equal(ethers.parseEther("20"));

            // Claim remaining 20
            await portionalExit.connect(user1).claimExit(ethers.parseEther("20"));
            expect(await portionalExit.eligibleShares(1, user1Address)).to.equal(0);

            // Further claim reverts
            await expect(
                portionalExit.connect(user1).claimExit(ethers.parseEther("1"))
            ).to.be.revertedWith("Exceeds eligible balance");
        });

        it("StrategyExit: should deduct managerFee to managerAddress and remit net tokens to user", async function () {
            const StrategyExit = await ethers.getContractFactory("StrategyExit");
            const strategyExit = await StrategyExit.deploy(
                await treasuryVault.getAddress(),
                await usdc.getAddress(),
                ownerAddress,
                managerAddress,
                2000 // 20% manager fee (2000 bps)
            );
            await strategyExit.waitForDeployment();
            await (await usdc.mint(await strategyExit.getAddress(), ethers.parseEther("500"))).wait();

            const block = await ethers.provider.getBlock("latest");
            const exitWindowEnd = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 86400;

            await strategyExit.startExitPeriod(
                1,
                ethers.parseEther("1"),
                exitWindowEnd,
                [user1Address],
                [ethers.parseEther("100")]
            );

            const userUsdcBefore = await usdc.balanceOf(user1Address);
            const managerUsdcBefore = await usdc.balanceOf(managerAddress);

            // User claims 100 treasuryToken exit -> Gross 100 USDC. Manager gets 20%, User gets 80%.
            await strategyExit.connect(user1).claimExit(ethers.parseEther("100"));

            const userUsdcAfter = await usdc.balanceOf(user1Address);
            const managerUsdcAfter = await usdc.balanceOf(managerAddress);

            expect(userUsdcAfter - userUsdcBefore).to.equal(ethers.parseEther("80"));
            expect(managerUsdcAfter - managerUsdcBefore).to.equal(ethers.parseEther("20"));
        });

        it("ImmutableExit: claimExit should revert with ExitNotSupported()", async function () {
            const ImmutableExit = await ethers.getContractFactory("ImmutableExit");
            const immutableExit = await ImmutableExit.deploy(await treasuryVault.getAddress(), 1);
            await immutableExit.waitForDeployment();

            await expect(
                immutableExit.claimExit(ethers.parseEther("10"))
            ).to.be.revertedWithCustomError(immutableExit, "ExitNotSupported");
        });
    });
});
