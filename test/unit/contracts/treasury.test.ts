import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import * as fs from "fs";
import * as path from "path";

describe("moreLikely Smart Treasury Suite", function () {
    let owner: Signer;
    let stakeholder: Signer;
    let aiAgent: Signer;
    let outsider: Signer;

    let ownerAddress: string;
    let stakeholderAddress: string;
    let aiAgentAddress: string;

    let usdc: any;
    let weth: any;
    let treasuryToken: any;
    let treasuryVault: any;
    let mockRouter: any;
    let swapPolicy: any;

    async function addNewToken(tokenAddr: string) {
        if (await treasuryVault.approvedTokens(tokenAddr)) return;
        const tx = await treasuryVault.proposalOpen(
            0,
            ethers.ZeroAddress,
            ownerAddress,
            2, // ADD_TOKEN
            tokenAddr
        );
        await tx.wait();
        const pId = await treasuryVault.proposalNum();
        await (await treasuryVault.newToken(tokenAddr, pId)).wait();
    }

    beforeEach(async function () {
        [owner, stakeholder, aiAgent, outsider] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        stakeholderAddress = await stakeholder.getAddress();
        aiAgentAddress = await aiAgent.getAddress();

        // 1. Deploy Mock ERC20 Tokens (USDC & WETH)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("Mock USDC", "USDC");
        await usdc.waitForDeployment();
        weth = await MockERC20.deploy("Mock WETH", "WETH");
        await weth.waitForDeployment();
        const initToken = await MockERC20.deploy("Init Token", "INIT");
        await initToken.waitForDeployment();

        // 2. Deploy TreasuryToken
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy(
            "Treasury Shares",
            "TRES",
            ownerAddress
        );
        await treasuryToken.waitForDeployment();

        // 3. Deploy TreasuryVault (ERC4626)
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

        // Configure vault address on TreasuryToken so it can mint
        const tx = await treasuryToken.setVault(await treasuryVault.getAddress());
        await tx.wait();

        // 4. Deploy Mock Uniswap Universal Router
        // rate: 1000 WETH per 1 USDC (scaled by 1e18) -> to simulate swap outputs
        const MockUniversalRouter = await ethers.getContractFactory("MockUniversalRouter");
        mockRouter = await MockUniversalRouter.deploy(
            await usdc.getAddress(),
            await weth.getAddress(),
            ethers.parseEther("1000") // 1 USDC = 1000 WETH
        );
        await mockRouter.waitForDeployment();

        // Fund Mock Router with WETH to perform swaps
        const mintRouterTx = await weth.mint(
            await mockRouter.getAddress(),
            ethers.parseEther("1000000")
        );
        await mintRouterTx.wait();

        // 5. Deploy AssetSwapPolicy
        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        swapPolicy = await AssetSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            await mockRouter.getAddress(),
            aiAgentAddress
        );
        await swapPolicy.waitForDeployment();
    });

    it("should allow a user to join the treasury", async function () {
        // Approve Mock USDC in vault (owner-only function in vault: newToken)
        await addNewToken(await usdc.getAddress());

        // Mint USDC to stakeholder
        const mintUsdcTx = await usdc.mint(stakeholderAddress, ethers.parseEther("100"));
        await mintUsdcTx.wait();

        // Approve USDC transfer to vault
        const approveUsdcTx = await usdc
            .connect(stakeholder)
            .approve(await treasuryVault.getAddress(), ethers.parseEther("100"));
        await approveUsdcTx.wait();

        // Join Treasury
        // joinTreasury(token, amount)
        const joinTx = await treasuryVault
            .connect(stakeholder)
            .joinTreasury(await usdc.getAddress(), ethers.parseEther("100"));
        await joinTx.wait();

        // Check if stakeholder received TreasuryToken (shares) 1:1
        const balance = await treasuryToken.balanceOf(stakeholderAddress);
        expect(balance).to.equal(ethers.parseEther("100"));

        // Check vault holds the USDC assets
        const vaultBalance = await usdc.balanceOf(await treasuryVault.getAddress());
        expect(vaultBalance).to.equal(ethers.parseEther("100"));

    });

    it("should execute an asset swap successfully through the policy and router", async function () {
        // Approve USDC in vault
        await addNewToken(await usdc.getAddress());

        // Mint USDC to stakeholder
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();

        // Approve and join treasury
        await (
            await usdc
                .connect(stakeholder)
                .approve(await treasuryVault.getAddress(), ethers.parseEther("100"))
        ).wait();
        await (
            await treasuryVault
                .connect(stakeholder)
                .joinTreasury(
                    await usdc.getAddress(),
                    ethers.parseEther("100")
                )
        ).wait();

        // Open a proposal to swap 50 USDC to WETH
        // proposalOpen(amount, receiver, owner, rate, request, token)
        const openProposalTx = await treasuryVault.proposalOpen(
            ethers.parseEther("50"),
            await swapPolicy.getAddress(), // receiver is the swap policy
            ownerAddress,
            0, // ProposalType.TXNS
            await usdc.getAddress()
        );
        const receipt = await openProposalTx.wait();
        const proposalId = await treasuryVault.proposalNum(); // First proposal

        // Voter approves proposal by depositing voting tokens (treasuryToken)
        // proposalDeposit(assets, receiver, proposal)
        // First stakeholder must approve the vault to spend their TreasuryToken
        await (
            await treasuryToken
                .connect(stakeholder)
                .approve(await treasuryVault.getAddress(), ethers.parseEther("50"))
        ).wait();

        await (
            await treasuryVault
                .connect(stakeholder)
                .proposalDeposit(
                    ethers.parseEther("50"),
                    stakeholderAddress,
                    proposalId
                )
        ).wait();

        // Check if vault voting checks pass (total shares >= withdraw amount)
        const isApprovedOnVault = await treasuryVault.vote(proposalId);
        expect(isApprovedOnVault).to.be.true;

        // Approve/Execute proposal on vault: transfers USDC to swapPolicy contract
        const approveProposalTx = await treasuryVault.proposalApproved(proposalId);
        await approveProposalTx.wait();

        // Check swapPolicy now holds the 50 USDC
        const policyUsdc = await usdc.balanceOf(await swapPolicy.getAddress());
        expect(policyUsdc).to.equal(ethers.parseEther("50"));

        // Generate AI Agent attestation signature
        // keccak256(abi.encodePacked(proposalId, totalVotesFor, totalVotesAgainst, passed))
        const totalVotesFor = ethers.parseEther("50");
        const totalVotesAgainst = 0;
        const passed = true;

        const messageHash = ethers.solidityPackedKeccak256(
            ["uint256", "uint256", "uint256", "bool"],
            [proposalId, totalVotesFor, totalVotesAgainst, passed]
        );
        const attestationSignature = await aiAgent.signMessage(
            ethers.toBeArray(messageHash)
        );

        // Define mock swap call data (MockUniversalRouter expects no specific structure, just fallback execution)
        const swapCallData = "0x";

        // Execute Swap on policy
        const block = await ethers.provider.getBlock("latest");
        const deadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;
        const executeSwapTx = await swapPolicy.executeSwap(
            proposalId,
            await usdc.getAddress(),
            await weth.getAddress(),
            ethers.parseEther("50"),
            0,
            deadline,
            swapCallData
        );
        await executeSwapTx.wait();

        // Verify output:
        // Mock swap rate: 1000 WETH per 1 USDC. Swapped 50 USDC.
        // Output should be 50,000 WETH, explicitly held by swapPolicy.
        const policyWeth = await weth.balanceOf(await swapPolicy.getAddress());
        expect(policyWeth).to.equal(ethers.parseEther("50000"));

        // Policy contract should have transferred out all USDC
        expect(await usdc.balanceOf(await swapPolicy.getAddress())).to.equal(0);
        
        // Vault WETH balance should still be 0 (held by policy)
        const vaultWeth = await weth.balanceOf(await treasuryVault.getAddress());
        expect(vaultWeth).to.equal(0);
    });

    it.skip("should prevent execution of a swap if the proposal is disputed", async function () {
        // Approve USDC in vault
        await addNewToken(await usdc.getAddress());
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
        await (
            await usdc
                .connect(stakeholder)
                .approve(await treasuryVault.getAddress(), ethers.parseEther("100"))
        ).wait();
        await (
            await treasuryVault
                .connect(stakeholder)
                .joinTreasury(
                    await usdc.getAddress(),
                    ethers.parseEther("100")
                )
        ).wait();

        const proposalId = 1;
        await (
            await treasuryVault.proposalOpen(
                ethers.parseEther("50"),
                await swapPolicy.getAddress(),
                ownerAddress,
                0, // ProposalType.TXNS
                await usdc.getAddress()
            )
        ).wait();

        await (
            await treasuryToken
                .connect(stakeholder)
                .approve(await treasuryVault.getAddress(), ethers.parseEther("50"))
        ).wait();
        await (
            await treasuryVault
                .connect(stakeholder)
                .proposalDeposit(
                    ethers.parseEther("50"),
                    stakeholderAddress,
                    proposalId
                )
        ).wait();

        await (await treasuryVault.proposalApproved(proposalId)).wait();

        // Stakeholder triggers dispute on policy contract
        const disputeTx = await swapPolicy.connect(stakeholder).triggerDispute(proposalId);
        await disputeTx.wait();

        expect(await swapPolicy.isPaused(proposalId)).to.be.true;

        // Attempting to execute swap should fail/revert
        const totalVotesFor = ethers.parseEther("50");
        const totalVotesAgainst = 0;
        const passed = true;
        const messageHash = ethers.solidityPackedKeccak256(
            ["uint256", "uint256", "uint256", "bool"],
            [proposalId, totalVotesFor, totalVotesAgainst, passed]
        );
        const attestationSignature = await aiAgent.signMessage(
            ethers.toBeArray(messageHash)
        );
        const swapCallData = "0x";

        const block = await ethers.provider.getBlock("latest");
        const deadline = (block ? block.timestamp : Math.floor(Date.now() / 1000)) + 3600;
        await expect(
            swapPolicy.executeSwap(
                proposalId,
                await usdc.getAddress(),
                await weth.getAddress(),
                ethers.parseEther("50"),
                0,
                deadline,
                swapCallData
            )
        ).to.be.revertedWith("Proposal execution is paused due to dispute");

        // Owner resolves dispute
        const resolveTx = await swapPolicy.connect(owner).resolveDispute(proposalId);
        await resolveTx.wait();

        // Now swap should execute successfully
        const executeSwapTx = await swapPolicy.executeSwap(
            proposalId,
            await usdc.getAddress(),
            await weth.getAddress(),
            ethers.parseEther("50"),
            0,
            deadline,
            swapCallData
        );
        await executeSwapTx.wait();

        const vaultWeth = await weth.balanceOf(await treasuryVault.getAddress());
        expect(vaultWeth).to.equal(ethers.parseEther("50000"));
    });

    it("should have correct treasury name and owner", async function () {
        expect(await treasuryVault.treasName()).to.equal("moreLikely Treasury");
        expect(await treasuryVault.tOwner()).to.equal(ownerAddress);
    });

    it("should allow owner to approve a new token", async function () {
        const tokenAddress = await weth.getAddress();
        await addNewToken(tokenAddress);
        expect(await treasuryVault.approvedTokens(tokenAddress)).to.equal(true);
    });

    it("should open a new proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await swapPolicy.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        expect(await treasuryVault.proposalNum()).to.equal(2); // Since addNewToken opens 1 ADD_TOKEN proposal
    });

    it("should allow deposit to proposal and track shares", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await swapPolicy.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("50"))).wait();
        await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("50"));
        await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        
        const pId = await treasuryVault.proposalNum();
        
        await treasuryVault.connect(stakeholder).proposalDeposit(
            ethers.parseEther("50"),
            stakeholderAddress,
            pId
        );
        expect(await treasuryVault.totalShares(pId)).to.be.above(0);
        expect((await treasuryVault.userBook(stakeholderAddress, pId)).deposit).to.be.above(0);
    });

    it("should allow closing a proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await swapPolicy.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        const pId = await treasuryVault.proposalNum();
        await treasuryVault.proposalClose(pId);
        expect(await treasuryVault.closedProposals(pId)).to.equal(true);
    });

    it("should allow user to withdraw from a proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await swapPolicy.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        const pId = await treasuryVault.proposalNum();
        
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("50"))).wait();
        await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("50"));
        await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).proposalDeposit(
            ethers.parseEther("50"),
            stakeholderAddress,
            pId
        );
        await treasuryVault.proposalClose(pId);
        
        const beforeBalance = await treasuryToken.balanceOf(stakeholderAddress);
        await treasuryVault.connect(stakeholder).proposalWithdraw(
            ethers.parseEther("25"),
            stakeholderAddress,
            stakeholderAddress,
            pId
        );
        const afterBalance = await treasuryToken.balanceOf(stakeholderAddress);
        expect(afterBalance - beforeBalance).to.equal(ethers.parseEther("25"));
        // Check userWithdrew is updated for the specific proposal
        const wAmount = (await treasuryVault.userBook(stakeholderAddress, pId)).withdrew;
        expect(wAmount).to.equal(ethers.parseEther("25"));
    });

    it("should return correct proposal details", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await swapPolicy.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        const pId = await treasuryVault.proposalNum();
        const prop = await treasuryVault.proposalBook(pId);
        expect(prop.token).to.equal(tokenAddress);
        expect(prop.receiver).to.equal(await swapPolicy.getAddress());
        expect(await treasuryVault.closedProposals(pId)).to.equal(false);
        expect(await treasuryVault.executed(pId)).to.equal(false);
    });

    it("should revert if non-owner tries to approve new token", async function () {
        const tokenAddress = await usdc.getAddress();
        await expect(
            treasuryVault.connect(stakeholder).newToken(tokenAddress, 999)
        ).to.be.revertedWith("Not authorized");
    });

    describe("Audit Report 1 Remediation: Vault & Token Accounting", function () {
        let testToken: any;

        beforeEach(async function () {
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            testToken = await MockERC20.deploy("Test Token", "TEST");
            await testToken.waitForDeployment();
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #9
         * @description proposalMint does not check that proposal <= proposalNum or proposal > 0.
         * Verifies bounds checking prevents invalid proposal shares from being minted.
         */
        describe("[Finding #9] proposalMint Bound Verification", function () {
            it("should revert when proposal ID is 0", async function () {
                await expect(
                    treasuryVault.connect(stakeholder).proposalMint(ethers.parseEther("10"), stakeholderAddress, 0)
                ).to.be.reverted;
            });

            it("should revert when proposal ID exceeds proposalNum", async function () {
                const currentProposalNum = await treasuryVault.proposalNum();
                await expect(
                    treasuryVault.connect(stakeholder).proposalMint(
                        ethers.parseEther("10"),
                        stakeholderAddress,
                        currentProposalNum + 10n
                    )
                ).to.be.revertedWith("Invalid proposal");
            });

            it("should succeed when minting against an active proposal within bounds", async function () {
                // User joins treasury to get underlying treasuryToken
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                // Open active proposal
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0, // ProposalType.TXNS
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                // Approve vault to spend treasuryToken for minting shares
                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"))).wait();

                const shares = ethers.parseEther("20");
                await expect(
                    treasuryVault.connect(stakeholder).proposalMint(shares, stakeholderAddress, pId)
                ).to.not.be.reverted;
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #10
         * @description proposalMint accounts shares to totalShares and userBook, not raw assets.
         */
        describe("[Finding #10] proposalMint Shares Accounting", function () {
            it("should accurately increment totalShares and userBook by minted shares", async function () {
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"))).wait();

                const shares = ethers.parseEther("30");
                const initialTotalShares = await treasuryVault.totalShares(pId);
                const initialUserDeposit = (await treasuryVault.userBook(stakeholderAddress, pId)).deposit;

                await treasuryVault.connect(stakeholder).proposalMint(shares, stakeholderAddress, pId);

                const finalTotalShares = await treasuryVault.totalShares(pId);
                const finalUserDeposit = (await treasuryVault.userBook(stakeholderAddress, pId)).deposit;

                expect(finalTotalShares - initialTotalShares).to.equal(shares);
                expect(finalUserDeposit - initialUserDeposit).to.equal(shares);
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #2
         * @description proposalRedeem does not cap redemption to deposit - withdrew for the proposal.
         */
        describe("[Finding #2] proposalRedeem Cap & State Protection", function () {
            it("should revert if redeeming more shares than deposit - withdrew", async function () {
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"))).wait();
                await (await treasuryVault.connect(stakeholder).proposalDeposit(ethers.parseEther("20"), stakeholderAddress, pId)).wait();

                // Close proposal
                await (await treasuryVault.proposalClose(pId)).wait();

                // Attempt to redeem more than 20 shares
                await expect(
                    treasuryVault.connect(stakeholder).proposalRedeem(
                        ethers.parseEther("25"),
                        stakeholderAddress,
                        stakeholderAddress,
                        pId
                    )
                ).to.be.revertedWith("Exceeds proposal deposit");
            });

            it("should succeed redeeming up to remaining proposal shares and track partial redemptions", async function () {
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"))).wait();
                await (await treasuryVault.connect(stakeholder).proposalDeposit(ethers.parseEther("20"), stakeholderAddress, pId)).wait();
                await (await treasuryVault.proposalClose(pId)).wait();

                // First partial redeem: 10 shares
                await treasuryVault.connect(stakeholder).proposalRedeem(
                    ethers.parseEther("10"),
                    stakeholderAddress,
                    stakeholderAddress,
                    pId
                );

                let record = await treasuryVault.userBook(stakeholderAddress, pId);
                expect(record.withdrew).to.equal(ethers.parseEther("10"));

                // Second partial redeem: remaining 10 shares
                await treasuryVault.connect(stakeholder).proposalRedeem(
                    ethers.parseEther("10"),
                    stakeholderAddress,
                    stakeholderAddress,
                    pId
                );

                record = await treasuryVault.userBook(stakeholderAddress, pId);
                expect(record.withdrew).to.equal(ethers.parseEther("20"));

                // Further redemption must revert
                await expect(
                    treasuryVault.connect(stakeholder).proposalRedeem(
                        ethers.parseEther("1"),
                        stakeholderAddress,
                        stakeholderAddress,
                        pId
                    )
                ).to.be.revertedWith("Exceeds proposal deposit");
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #16
         * @description proposalWithdraw converts asset units to share units and caps to deposit - withdrew.
         */
        describe("[Finding #16] proposalWithdraw Unit Consistency & Quota Enforcement", function () {
            it("should revert if required shares for requested asset amount exceed quota", async function () {
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("20"))).wait();
                await (await treasuryVault.connect(stakeholder).proposalDeposit(ethers.parseEther("20"), stakeholderAddress, pId)).wait();
                await (await treasuryVault.proposalClose(pId)).wait();

                // Attempt to withdraw 30 assets (exceeds 20 shares quota)
                await expect(
                    treasuryVault.connect(stakeholder).proposalWithdraw(
                        ethers.parseEther("30"),
                        stakeholderAddress,
                        stakeholderAddress,
                        pId
                    )
                ).to.be.revertedWith("Exceeds proposal deposit");
            });

            it("should correctly burn shares, disburse underlying assets, and record withdrew shares", async function () {
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("20"))).wait();
                await (await treasuryVault.connect(stakeholder).proposalDeposit(ethers.parseEther("20"), stakeholderAddress, pId)).wait();
                await (await treasuryVault.proposalClose(pId)).wait();

                const userTokensBefore = await treasuryToken.balanceOf(stakeholderAddress);
                await treasuryVault.connect(stakeholder).proposalWithdraw(
                    ethers.parseEther("15"),
                    stakeholderAddress,
                    stakeholderAddress,
                    pId
                );
                const userTokensAfter = await treasuryToken.balanceOf(stakeholderAddress);
                expect(userTokensAfter - userTokensBefore).to.equal(ethers.parseEther("15"));

                const withdrewShares = (await treasuryVault.userBook(stakeholderAddress, pId)).withdrew;
                expect(withdrewShares).to.equal(ethers.parseEther("15"));
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #17
         * @description newToken requires ADD_TOKEN request type, matching token address, quorum vote, and uniqueness.
         */
        describe("[Finding #17] newToken Proposal Binding & Vote Quorum", function () {
            it("should revert if proposal request type is not ADD_TOKEN", async function () {
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("10"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0, // TXNS
                    await testToken.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await expect(
                    treasuryVault.newToken(await testToken.getAddress(), pId)
                ).to.be.revertedWith("Not ADD_TOKEN proposal");
            });

            it("should revert if token address does not match proposal token", async function () {
                await (await treasuryVault.proposalOpen(
                    0,
                    ethers.ZeroAddress,
                    ownerAddress,
                    2, // ADD_TOKEN
                    await testToken.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await expect(
                    treasuryVault.newToken(await usdc.getAddress(), pId)
                ).to.be.revertedWith("Token does not match proposal");
            });

            it("should revert if vote fails due to lack of quorum", async function () {
                // First create total supply of treasuryToken so quorum check requires votes
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                // Open ADD_TOKEN proposal without depositing any votes
                await (await treasuryVault.proposalOpen(
                    0,
                    ethers.ZeroAddress,
                    ownerAddress,
                    2, // ADD_TOKEN
                    await testToken.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await expect(
                    treasuryVault.newToken(await testToken.getAddress(), pId)
                ).to.be.revertedWith("Vote failed");
            });

            it("should revert if token is already approved", async function () {
                await addNewToken(await testToken.getAddress());
                expect(await treasuryVault.approvedTokens(await testToken.getAddress())).to.be.true;

                // Open another proposal attempting to re-approve testToken
                await (await treasuryVault.proposalOpen(
                    0,
                    ethers.ZeroAddress,
                    ownerAddress,
                    2,
                    await testToken.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await expect(
                    treasuryVault.newToken(await testToken.getAddress(), pId)
                ).to.be.revertedWith("Token already approved");
            });

            it("should revert if proposal has already been executed", async function () {
                await (await treasuryVault.proposalOpen(
                    0,
                    ethers.ZeroAddress,
                    ownerAddress,
                    2,
                    await testToken.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                await treasuryVault.newToken(await testToken.getAddress(), pId);

                await expect(
                    treasuryVault.newToken(await testToken.getAddress(), pId)
                ).to.be.revertedWith("Proposal already executed");
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #4
         * @description proposalApproved executes CLOSE proposals without auth revert on _proposalClose.
         */
        describe("[Finding #4] proposalApproved CLOSE Execution Without Auth Revert", function () {
            it("should allow a non-owner shareholder to execute proposalApproved for an approved CLOSE proposal", async function () {
                // Stakeholder gets tokens
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("100"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("100"))).wait();

                // Open a TXNS proposal to target
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("20"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const targetProposalId = await treasuryVault.proposalNum();

                // Non-owner shareholder opens CLOSE proposal (withdraw amount indicates targetProposalId)
                await (await treasuryVault.connect(stakeholder).proposalOpen(
                    targetProposalId,
                    ethers.ZeroAddress,
                    stakeholderAddress,
                    1, // ProposalType.CLOSE
                    await usdc.getAddress()
                )).wait();
                const closeProposalId = await treasuryVault.proposalNum();

                // Stakeholder votes to reach threshold on closeProposalId
                await (await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();
                await (await treasuryVault.connect(stakeholder).proposalDeposit(ethers.parseEther("50"), stakeholderAddress, closeProposalId)).wait();

                expect(await treasuryVault.vote(closeProposalId)).to.be.true;

                // Non-owner executes proposalApproved - must not revert with "Not authorized" or "Not owner"
                await expect(
                    treasuryVault.connect(stakeholder).proposalApproved(closeProposalId)
                ).to.not.be.reverted;

                expect(await treasuryVault.closedProposals(targetProposalId)).to.be.true;
                expect(await treasuryVault.closedProposals(closeProposalId)).to.be.true;
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #8
         * @description owed() safely returns 0 if deposits exceed withdraws, preventing arithmetic underflow.
         */
        describe("[Finding #8] owed() Safe Return on Over-repayment", function () {
            it("should return full withdraw amount when deposits are 0", async function () {
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                expect(await treasuryVault.owed(pId)).to.equal(ethers.parseEther("50"));
            });

            it("should return remaining withdraw amount when deposits < withdraw", async function () {
                await addNewToken(await usdc.getAddress());
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();
                await (await treasuryVault.proposalClose(pId)).wait();

                // Partial repayment of 20
                await (await usdc.mint(ownerAddress, ethers.parseEther("20"))).wait();
                await (await usdc.approve(await treasuryVault.getAddress(), ethers.parseEther("20"))).wait();
                await (await treasuryVault.depositTreasury(await usdc.getAddress(), ethers.parseEther("20"), true, pId)).wait();

                expect(await treasuryVault.owed(pId)).to.equal(ethers.parseEther("30"));
            });

            it("should return 0 when deposits exceed withdraw (overpaid proposal)", async function () {
                await addNewToken(await usdc.getAddress());
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();
                await (await treasuryVault.proposalClose(pId)).wait();

                // Overpay proposal with 60
                await (await usdc.mint(ownerAddress, ethers.parseEther("60"))).wait();
                await (await usdc.approve(await treasuryVault.getAddress(), ethers.parseEther("60"))).wait();
                await (await treasuryVault.depositTreasury(await usdc.getAddress(), ethers.parseEther("60"), true, pId)).wait();

                expect(await treasuryVault.owed(pId)).to.equal(0);
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #13 & Finding #20
         * @description depositTreasury pulls from msg.sender and allows proposal 0 wind-down deposits.
         */
        describe("[Finding #13 & #20] depositTreasury Sender Mechanics & Proposal 0 Wind-Down", function () {
            it("should pull tokens from msg.sender and credit proposal deposits", async function () {
                await addNewToken(await usdc.getAddress());
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("50"),
                    await swapPolicy.getAddress(),
                    ownerAddress,
                    0,
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();
                await (await treasuryVault.proposalClose(pId)).wait();

                // Stakeholder repays on behalf of the proposal
                await (await usdc.mint(stakeholderAddress, ethers.parseEther("25"))).wait();
                await (await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("25"))).wait();
                await (await treasuryVault.connect(stakeholder).depositTreasury(await usdc.getAddress(), ethers.parseEther("25"), true, pId)).wait();

                const prop = await treasuryVault.proposalBook(pId);
                expect(prop.deposits).to.equal(ethers.parseEther("25"));
            });

            it("should succeed for wind-down depositTreasury with proposal=false and num=0", async function () {
                await addNewToken(await usdc.getAddress());
                await (await usdc.mint(ownerAddress, ethers.parseEther("100"))).wait();
                await (await usdc.approve(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();

                await expect(
                    treasuryVault.depositTreasury(await usdc.getAddress(), ethers.parseEther("100"), false, 0)
                ).to.not.be.reverted;
            });
        });

        /**
         * @audit pashov-ai-audit-report-1.md - Finding #15
         * @description proposalApproved executes ProposalType.EXIT proposals to compliant exit contracts.
         */
        describe("[Finding #15] proposalApproved Executing ProposalType.EXIT", function () {
            it("should transfer exit tokens and mark proposal executed for ProposalType.EXIT", async function () {
                await addNewToken(await usdc.getAddress());

                // Deploy DissolutionExit as receiver
                const DissolutionExit = await ethers.getContractFactory("DissolutionExit");
                const dissolutionExit = await DissolutionExit.deploy(
                    await treasuryVault.getAddress(),
                    await usdc.getAddress(),
                    1,
                    ethers.parseEther("1"),
                    Math.floor(Date.now() / 1000) + 86400
                );
                await dissolutionExit.waitForDeployment();

                // Fund vault with 100 USDC
                await (await usdc.mint(await treasuryVault.getAddress(), ethers.parseEther("100"))).wait();

                // Open ProposalType.EXIT
                await (await treasuryVault.proposalOpen(
                    ethers.parseEther("40"),
                    await dissolutionExit.getAddress(),
                    ownerAddress,
                    3, // ProposalType.EXIT
                    await usdc.getAddress()
                )).wait();
                const pId = await treasuryVault.proposalNum();

                // Approve proposal (totalSupply == 0 so vote passes)
                await expect(
                    treasuryVault.proposalApproved(pId)
                ).to.not.be.reverted;

                expect(await treasuryVault.executed(pId)).to.be.true;
                const exitContractBalance = await usdc.balanceOf(await dissolutionExit.getAddress());
                expect(exitContractBalance).to.equal(ethers.parseEther("40"));
            });
        });
    });
});
