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
        const tx = await treasuryVault.proposalOpen(
            0,
            ethers.ZeroAddress,
            ownerAddress,
            1, // ADD_TOKEN
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
        // constructor: tresName, tToken (underlying), name, symbol
        // Note: TreasuryVault constructor uses ERC4626(tToken), so treasuryToken is the underlying ERC20 token
        // and vault itself mints share tokens.
        // Wait, EIP-7425/Open Treasury spec says:
        // "The ERC7425 standard implements one ERC20 token standard, the treasuryToken,
        // and one ERC4626 vault standard."
        // In TreasuryVault.sol: constructor(tresName, tToken, name, symbol) ERC4626(tToken)
        // This means the tToken is the underlying asset.
        // In joinTreasury: msg.sender deposits approved token (e.g. USDC) and receives treasuryToken (tToken).
        // Let's check: in joinTreasury:
        // SafeERC20.safeTransferFrom(token, msg.sender, address(this), amount);
        // ITreasuryToken(address(_treasuryToken)).mintTreasury(msg.sender, amount);
        // So the user gets treasuryToken (which represents their shares).
        // Let's set treasuryToken as the underlying asset of ERC4626 vault.
        treasuryVault = await TreasuryVault.deploy(
            "moreLikely Treasury",
            await treasuryToken.getAddress(),
            await usdc.getAddress(),
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
        // joinTreasury(token, amount, isProposal, proposalNum)
        const joinTx = await treasuryVault
            .connect(stakeholder)
            .joinTreasury(await usdc.getAddress(), ethers.parseEther("100"), false, 0);
        await joinTx.wait();

        // Check if stakeholder received TreasuryToken (shares) 1:1
        const balance = await treasuryToken.balanceOf(stakeholderAddress);
        expect(balance).to.equal(ethers.parseEther("100"));

        // Check vault holds the USDC assets
        const vaultBalance = await usdc.balanceOf(await treasuryVault.getAddress());
        expect(vaultBalance).to.equal(ethers.parseEther("100"));

        // Explicitly check that Proposal 0 tracked the unallocated deposit
        const proposalZeroDeposit = await treasuryVault.userDeposit(stakeholderAddress, 0);
        expect(proposalZeroDeposit).to.equal(ethers.parseEther("100"));
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
                    ethers.parseEther("100"),
                    false,
                    0
                )
        ).wait();

        // Open a proposal to swap 50 USDC to WETH
        // proposalOpen(amount, receiver, owner, rate, request, token)
        const openProposalTx = await treasuryVault.proposalOpen(
            ethers.parseEther("50"),
            await swapPolicy.getAddress(), // receiver is the swap policy
            ownerAddress,
            true, // value-ratio voting
            false, // request voting (false = withdrawal proposal)
            await usdc.getAddress()
        );
        const receipt = await openProposalTx.wait();
        const proposalId = 1; // First proposal

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
        const executeSwapTx = await swapPolicy.executeSwap(
            proposalId,
            await usdc.getAddress(),
            await weth.getAddress(),
            ethers.parseEther("50"),
            totalVotesFor,
            totalVotesAgainst,
            attestationSignature,
            swapCallData
        );
        await executeSwapTx.wait();

        // Verify output:
        // Mock swap rate: 1000 WETH per 1 USDC. Swapped 50 USDC.
        // Output should be 50,000 WETH, sent back to treasuryVault.
        const vaultWeth = await weth.balanceOf(await treasuryVault.getAddress());
        expect(vaultWeth).to.equal(ethers.parseEther("50000"));

        // Policy contract should have transferred out all USDC and WETH
        expect(await usdc.balanceOf(await swapPolicy.getAddress())).to.equal(0);
        expect(await weth.balanceOf(await swapPolicy.getAddress())).to.equal(0);
    });

    it("should prevent execution of a swap if the proposal is disputed", async function () {
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
                    ethers.parseEther("100"),
                    false,
                    0
                )
        ).wait();

        const proposalId = 1;
        await (
            await treasuryVault.proposalOpen(
                ethers.parseEther("50"),
                await swapPolicy.getAddress(),
                ownerAddress,
                true,
                false, // request voting (false = withdrawal proposal)
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

        await expect(
            swapPolicy.executeSwap(
                proposalId,
                await usdc.getAddress(),
                await weth.getAddress(),
                ethers.parseEther("50"),
                totalVotesFor,
                totalVotesAgainst,
                attestationSignature,
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
            totalVotesFor,
            totalVotesAgainst,
            attestationSignature,
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
            await outsider.getAddress(),
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
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("50"))).wait();
        await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("50"), false, 0);
        await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        
        await treasuryVault.connect(stakeholder).proposalDeposit(
            ethers.parseEther("50"),
            stakeholderAddress,
            4 // Since addNewToken opens 1 proposal, proposalOpen opens 1 proposal, previous tests opened some
        );
        expect(await treasuryVault.totalShares(4)).to.be.above(0);
        expect(await treasuryVault.userDeposit(stakeholderAddress, 4)).to.be.above(0);
    });

    it("should allow closing a proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
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
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        const pId = await treasuryVault.proposalNum();
        
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("50"))).wait();
        await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("50"), false, 0);
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
        expect(await treasuryVault.userWithdrew(stakeholderAddress, pId)).to.equal(ethers.parseEther("25"));
    });

    it("should return correct proposal details", async function () {
        const tokenAddress = await usdc.getAddress();
        await addNewToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            0, // ProposalType.TXNS
            tokenAddress
        );
        const pId = await treasuryVault.proposalNum();
        const prop = await treasuryVault.proposalBook(pId);
        expect(prop.token).to.equal(tokenAddress);
        expect(prop.receiver).to.equal(await outsider.getAddress());
        expect(await treasuryVault.closedProposals(pId)).to.equal(false);
        expect(await treasuryVault.executed(pId)).to.equal(false);
    });

    it("should revert if non-owner tries to approve new token", async function () {
        const tokenAddress = await usdc.getAddress();
        await expect(
            treasuryVault.connect(stakeholder).newToken(tokenAddress, 999)
        ).to.be.revertedWith("Not authorized");
    });
});
