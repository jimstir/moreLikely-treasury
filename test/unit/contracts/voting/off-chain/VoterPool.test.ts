import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("VoterPool - Off-Chain Voting & Capital Return Suite", function () {
    let owner: Signer;
    let user1: Signer;
    let user2: Signer;

    let ownerAddress: string;
    let user1Address: string;
    let user2Address: string;

    let usdc: any;
    let initToken: any;
    let treasuryToken: any;
    let treasuryVault: any;
    let voterPool: any;

    function hashLeaf(account: string, amount: bigint): string {
        return ethers.solidityPackedKeccak256(["address", "uint256"], [account, amount]);
    }

    function computeRoot(hashA: string, hashB: string): string {
        const a = BigInt(hashA);
        const b = BigInt(hashB);
        if (a < b) {
            return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [hashA, hashB]);
        } else {
            return ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [hashB, hashA]);
        }
    }

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        user1Address = await user1.getAddress();
        user2Address = await user2.getAddress();

        // 1. Deploy Mock Tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        usdc = await MockERC20.deploy("Mock USDC", "USDC");
        await usdc.waitForDeployment();
        initToken = await MockERC20.deploy("Init Token", "INIT");
        await initToken.waitForDeployment();

        // 2. Deploy TreasuryToken
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy("Treasury Shares", "TRES", ownerAddress);
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
        await (await treasuryToken.setVault(await treasuryVault.getAddress())).wait();

        // Add USDC to vault
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

        // 4. Deploy VoterPool
        const VoterPool = await ethers.getContractFactory("VoterPool");
        voterPool = await VoterPool.deploy(
            await treasuryVault.getAddress(),
            await treasuryToken.getAddress(),
            ownerAddress
        );
        await voterPool.waitForDeployment();

        // Fund user1 and user2 with treasuryToken by joining treasury
        await (await usdc.mint(user1Address, ethers.parseEther("500"))).wait();
        await (await usdc.connect(user1).approve(await treasuryVault.getAddress(), ethers.parseEther("500"))).wait();
        await (await treasuryVault.connect(user1).joinTreasury(await usdc.getAddress(), ethers.parseEther("500"))).wait();

        await (await usdc.mint(user2Address, ethers.parseEther("500"))).wait();
        await (await usdc.connect(user2).approve(await treasuryVault.getAddress(), ethers.parseEther("500"))).wait();
        await (await treasuryVault.connect(user2).joinTreasury(await usdc.getAddress(), ethers.parseEther("500"))).wait();
    });

    describe("Soulbound Receipt Token Controls", function () {
        it("should revert if a user tries to transfer their vToken receipt (Soulbound enforcement)", async function () {
            await (await treasuryToken.connect(user1).approve(await voterPool.getAddress(), ethers.parseEther("100"))).wait();
            await (await voterPool.connect(user1).depositTokens(ethers.parseEther("100"))).wait();

            expect(await voterPool.balanceOf(user1Address)).to.equal(ethers.parseEther("100"));

            await expect(
                voterPool.connect(user1).transfer(user2Address, ethers.parseEther("50"))
            ).to.be.revertedWith("VoterPool: vTokens are non-transferable");
        });
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #3
     * @description hasClaimed mapping prevents Merkle proof replay attacks against the same root.
     */
    describe("[Finding #3] hasClaimed Merkle Leaf Replay Prevention", function () {
        it("should succeed on first claim and revert with 'Already claimed for this root' on replay", async function () {
            const claimAmount = ethers.parseEther("100");
            const leaf1 = hashLeaf(user1Address, claimAmount);
            const leaf2 = hashLeaf(user2Address, claimAmount);
            const root = computeRoot(leaf1, leaf2);
            const proof = [leaf2];

            // User1 deposits tokens into VoterPool
            await (await treasuryToken.connect(user1).approve(await voterPool.getAddress(), claimAmount)).wait();
            await (await voterPool.connect(user1).depositTokens(claimAmount)).wait();

            // Set global unlock root
            await (await voterPool.updateGlobalUnlockRoot(root)).wait();

            // User1 claims exit: burns vTokens, receives treasuryToken
            const balBefore = await treasuryToken.balanceOf(user1Address);
            await voterPool.connect(user1).claimExit(claimAmount, proof);
            const balAfter = await treasuryToken.balanceOf(user1Address);
            expect(balAfter - balBefore).to.equal(claimAmount);
            expect(await voterPool.balanceOf(user1Address)).to.equal(0);

            // User1 deposits more tokens to gain vTokens again
            await (await treasuryToken.connect(user1).approve(await voterPool.getAddress(), claimAmount)).wait();
            await (await voterPool.connect(user1).depositTokens(claimAmount)).wait();

            // Attempt to replay claimExit with same proof on same root
            await expect(
                voterPool.connect(user1).claimExit(claimAmount, proof)
            ).to.be.revertedWith("Already claimed for this root");
        });

        it("should allow claiming on a newly published global unlock root", async function () {
            const claimAmount = ethers.parseEther("50");
            const leaf1 = hashLeaf(user1Address, claimAmount);
            const leaf2 = hashLeaf(user2Address, claimAmount);
            const root1 = computeRoot(leaf1, leaf2);
            const proof1 = [leaf2];

            await (await treasuryToken.connect(user1).approve(await voterPool.getAddress(), ethers.parseEther("100"))).wait();
            await (await voterPool.connect(user1).depositTokens(ethers.parseEther("100"))).wait();

            await (await voterPool.updateGlobalUnlockRoot(root1)).wait();
            await voterPool.connect(user1).claimExit(claimAmount, proof1);

            // Owner publishes new root for second unlock round (different claimAmount so root2 != root1)
            const newClaimAmount = ethers.parseEther("25");
            const newLeaf1 = hashLeaf(user1Address, newClaimAmount);
            const newLeaf2 = hashLeaf(user2Address, newClaimAmount);
            const root2 = computeRoot(newLeaf1, newLeaf2);
            const proof2 = [newLeaf2];

            await (await voterPool.updateGlobalUnlockRoot(root2)).wait();

            // Claiming under new root succeeds
            await expect(
                voterPool.connect(user1).claimExit(newClaimAmount, proof2)
            ).to.not.be.reverted;
        });
    });

    /**
     * @audit pashov-ai-audit-report-1.md - Finding #22
     * @description VoterPool redeems shares back to treasuryToken on proposal close so users can claimExit.
     */
    describe("[Finding #22] Proposal Capital Return from Vault upon Closing", function () {
        let proposalId: bigint;
        let swapPolicy: any;
        const voteAmount = ethers.parseEther("200");

        beforeEach(async function () {
            // Deploy Mock Router and AssetSwapPolicy as compliant receiver for TXNS proposal
            const MockUniversalRouter = await ethers.getContractFactory("MockUniversalRouter");
            const mockRouter = await MockUniversalRouter.deploy(
                await usdc.getAddress(),
                await initToken.getAddress(),
                ethers.parseEther("1000")
            );
            await mockRouter.waitForDeployment();

            const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
            swapPolicy = await AssetSwapPolicy.deploy(
                await treasuryVault.getAddress(),
                await mockRouter.getAddress(),
                ownerAddress
            );
            await swapPolicy.waitForDeployment();

            // User1 deposits into VoterPool
            await (await treasuryToken.connect(user1).approve(await voterPool.getAddress(), voteAmount)).wait();
            await (await voterPool.connect(user1).depositTokens(voteAmount)).wait();

            // Open TXNS proposal on TreasuryVault with compliant policy receiver
            await (await treasuryVault.proposalOpen(
                ethers.parseEther("10"),
                await swapPolicy.getAddress(),
                ownerAddress,
                0, // TXNS
                await usdc.getAddress()
            )).wait();
            proposalId = await treasuryVault.proposalNum();
        });

        it("submitBatchVote should deposit tokens into vault and hold vault shares", async function () {
            const leaf = hashLeaf(user1Address, voteAmount);

            await voterPool.submitBatchVote(
                proposalId,
                voteAmount,
                leaf,
                1,
                Math.floor(Date.now() / 1000) + 86400,
                leaf
            );

            // VoterPool should hold 0 treasuryToken and voteAmount vault shares
            expect(await treasuryToken.balanceOf(await voterPool.getAddress())).to.equal(0);
            expect(await treasuryVault.balanceOf(await voterPool.getAddress())).to.equal(voteAmount);
        });

        it("closeProposal should redeem vault shares back to VoterPool if vault proposal is closed", async function () {
            const leaf = hashLeaf(user1Address, voteAmount);
            await voterPool.submitBatchVote(
                proposalId,
                voteAmount,
                leaf,
                1,
                Math.floor(Date.now() / 1000) + 86400,
                leaf
            );

            // Vault proposal is closed
            await (await treasuryVault.proposalClose(proposalId)).wait();

            // VoterPool closes proposal -> triggers _redeemProposal
            await voterPool.closeProposal(proposalId, leaf);

            // VoterPool now holds treasuryToken again
            expect(await treasuryToken.balanceOf(await voterPool.getAddress())).to.equal(voteAmount);
            expect(await treasuryVault.balanceOf(await voterPool.getAddress())).to.equal(0);
        });

        it("claimExit should successfully disburse returned tokens to user without empty balance revert", async function () {
            const leaf = hashLeaf(user1Address, voteAmount);
            await voterPool.submitBatchVote(
                proposalId,
                voteAmount,
                leaf,
                1,
                Math.floor(Date.now() / 1000) + 86400,
                leaf
            );

            await (await treasuryVault.proposalClose(proposalId)).wait();
            await voterPool.closeProposal(proposalId, leaf);

            // User claims exit with empty proof (single leaf root)
            const userTreasuryBefore = await treasuryToken.balanceOf(user1Address);
            await voterPool.connect(user1).claimExit(voteAmount, []);
            const userTreasuryAfter = await treasuryToken.balanceOf(user1Address);

            expect(userTreasuryAfter - userTreasuryBefore).to.equal(voteAmount);
            expect(await voterPool.balanceOf(user1Address)).to.equal(0);
        });

        it("withdrawFromVault should independently redeem unredeemed vault shares for closed proposal", async function () {
            const leaf = hashLeaf(user1Address, voteAmount);
            await voterPool.submitBatchVote(
                proposalId,
                voteAmount,
                leaf,
                1,
                Math.floor(Date.now() / 1000) + 86400,
                leaf
            );

            // VoterPool closes proposal BEFORE vault proposal is closed
            await voterPool.closeProposal(proposalId, leaf);
            // Tokens still in vault because vault was not closed at that time
            expect(await treasuryToken.balanceOf(await voterPool.getAddress())).to.equal(0);

            // Later, vault proposal closes
            await (await treasuryVault.proposalClose(proposalId)).wait();

            // Owner calls withdrawFromVault to pull capital
            await voterPool.withdrawFromVault(proposalId);
            expect(await treasuryToken.balanceOf(await voterPool.getAddress())).to.equal(voteAmount);
        });
    });
});
