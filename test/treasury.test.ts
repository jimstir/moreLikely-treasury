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
        const AssestSwapPolicy = await ethers.getContractFactory("AssestSwapPolicy");
        swapPolicy = await AssestSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            await mockRouter.getAddress(),
            aiAgentAddress,
            ownerAddress
        );
        await swapPolicy.waitForDeployment();
    });

    it("should allow a user to join the treasury", async function () {
        // Approve Mock USDC in vault (owner-only function in vault: newToken)
        const approveTokenTx = await treasuryVault.newToken(await usdc.getAddress());
        await approveTokenTx.wait();

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
    });

    it("should execute an asset swap successfully through the policy and router", async function () {
        // Approve USDC in vault
        await (await treasuryVault.newToken(await usdc.getAddress())).wait();

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
        await (await treasuryVault.newToken(await usdc.getAddress())).wait();
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
        expect(await treasuryVault.treasuryName()).to.equal("moreLikely Treasury");
        expect(await treasuryVault.whosOwner()).to.equal(ownerAddress);
    });

    it("should allow owner to approve a new token", async function () {
        const tokenAddress = await weth.getAddress();
        await treasuryVault.newToken(tokenAddress);
        expect(await treasuryVault.approvedTokens(tokenAddress)).to.equal(true);
    });

    it("should open a new proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await treasuryVault.newToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            true,
            false,
            tokenAddress
        );
        expect(await treasuryVault.proposalCheck()).to.equal(1);
    });

    it("should allow deposit to proposal and track shares", async function () {
        const tokenAddress = await usdc.getAddress();
        await treasuryVault.newToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            true,
            false,
            tokenAddress
        );
        
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("50"))).wait();
        await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("50"), false, 0);
        await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        
        await treasuryVault.connect(stakeholder).proposalDeposit(
            ethers.parseEther("50"),
            stakeholderAddress,
            1
        );
        expect(await treasuryVault.totalShares(1)).to.be.above(0);
        expect(await treasuryVault.userDeposit(stakeholderAddress, 1)).to.be.above(0);
    });

    it("should allow closing a proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await treasuryVault.newToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            true,
            false,
            tokenAddress
        );
        await treasuryVault.proposalClose(1);
        expect(await treasuryVault.closedProposal(1)).to.equal(true);
    });

    it("should allow user to withdraw from a proposal", async function () {
        const tokenAddress = await usdc.getAddress();
        await treasuryVault.newToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            true,
            false,
            tokenAddress
        );
        
        await (await usdc.mint(stakeholderAddress, ethers.parseEther("50"))).wait();
        await usdc.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).joinTreasury(await usdc.getAddress(), ethers.parseEther("50"), false, 0);
        await treasuryToken.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("50"));
        await treasuryVault.connect(stakeholder).proposalDeposit(
            ethers.parseEther("50"),
            stakeholderAddress,
            1
        );
        await treasuryVault.proposalClose(1);
        
        const beforeBalance = await treasuryToken.balanceOf(stakeholderAddress);
        await treasuryVault.connect(stakeholder).proposalWithdraw(
            ethers.parseEther("25"),
            stakeholderAddress,
            stakeholderAddress,
            1
        );
        const afterBalance = await treasuryToken.balanceOf(stakeholderAddress);
        expect(afterBalance - beforeBalance).to.equal(ethers.parseEther("25"));
        expect(await treasuryVault.userWithdrew(stakeholderAddress, 1)).to.equal(ethers.parseEther("25"));
    });

    it("should return correct proposal details", async function () {
        const tokenAddress = await usdc.getAddress();
        await treasuryVault.newToken(tokenAddress);
        await treasuryVault.proposalOpen(
            ethers.parseEther("100"),
            await outsider.getAddress(),
            await stakeholder.getAddress(),
            true,
            false,
            tokenAddress
        );
        expect(await treasuryVault.proposalToken(1)).to.equal(tokenAddress);
        expect(await treasuryVault.proposalReceiver(1)).to.equal(await outsider.getAddress());
        expect(await treasuryVault.closedProposal(1)).to.equal(false);
        expect(await treasuryVault.executed(1)).to.equal(false);
    });

    it("should revert if non-owner tries to approve new token", async function () {
        const tokenAddress = await usdc.getAddress();
        await expect(
            treasuryVault.connect(stakeholder).newToken(tokenAddress)
        ).to.be.revertedWith("Not owner");
    });

    it("should execute a live swap on Sepolia Fork using Uniswap Swapping API transaction data", async function () {
        const apiKey = process.env.UNISWAP_API_KEY;
        if (!apiKey) {
            console.log("          [SKIPPED] Live Uniswap API test (no UNISWAP_API_KEY configured)");
            return;
        }

        const WETH_ADDRESS = "0x7b79995e5f793a07bc00c21412e50ecae098e7f9";
        const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
        const UNIVERSAL_ROUTER = "0x3fc91a3afd20baba244d2e0e97e68207d094d29c";

        // Deploy a policy contract configured with the real Sepolia Universal Router
        const AssestSwapPolicy = await ethers.getContractFactory("AssestSwapPolicy");
        const livePolicy = await AssestSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            UNIVERSAL_ROUTER,
            aiAgentAddress,
            ownerAddress
        );
        await livePolicy.waitForDeployment();

        // Approve live Sepolia WETH in our vault
        await (await treasuryVault.newToken(WETH_ADDRESS)).wait();

        // Stakeholder wraps native ETH to WETH
        const wethContract: any = await ethers.getContractAt(
            ["function deposit() payable", "function approve(address, uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
            WETH_ADDRESS
        );
        const depositTx = await wethContract.connect(stakeholder).deposit({ value: ethers.parseEther("1") });
        await depositTx.wait();

        // Stakeholder joins treasury with 1 WETH
        const approveTx = await wethContract.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("1"));
        await approveTx.wait();

        const joinTx = await treasuryVault.connect(stakeholder).joinTreasury(WETH_ADDRESS, ethers.parseEther("1"), false, 0);
        await joinTx.wait();

        // Open a proposal to swap 0.5 WETH for USDC
        const proposalId = 2; // since beforeEach does not reset proposal ID across tests if not redeployed? Wait, beforeEach does redeploy everything! So it is proposal ID 1.
        // Wait, does beforeEach redeploy everything? Yes, it redeploys TreasuryVault and tokens, so proposal ID is 1.
        const targetProposalId = 1;
        await (
            await treasuryVault.proposalOpen(
                ethers.parseEther("0.5"),
                await livePolicy.getAddress(),
                ownerAddress,
                true,
                false,
                WETH_ADDRESS
            )
        ).wait();

        // Vote on the proposal
        await (
            await treasuryToken
                .connect(stakeholder)
                .approve(await treasuryVault.getAddress(), ethers.parseEther("0.5"))
        ).wait();
        await (
            await treasuryVault
                .connect(stakeholder)
                .proposalDeposit(ethers.parseEther("0.5"), stakeholderAddress, targetProposalId)
        ).wait();

        // Execute proposal on vault (moves WETH to policy contract)
        await (await treasuryVault.proposalApproved(targetProposalId)).wait();

        // Verify livePolicy contract holds the WETH
        expect(await wethContract.balanceOf(await livePolicy.getAddress())).to.equal(ethers.parseEther("0.5"));

        // Fetch quote and transaction data from Uniswap Swapping API
        const response = await fetch("https://trade-api.gateway.uniswap.org/v1/quote", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify({
                tokenInChainId: 11155111,
                tokenOutChainId: 11155111,
                tokenIn: WETH_ADDRESS,
                tokenOut: USDC_ADDRESS,
                amount: ethers.parseEther("0.5").toString(),
                type: "EXACT_INPUT",
                recipient: await livePolicy.getAddress(),
                slippageTolerance: "0.5"
            })
        });

        const quoteResult = await response.json();
        if (!response.ok) {
            console.warn("          [SKIPPED] Uniswap API call failed. Details:", quoteResult);
            return;
        }

        const swapCallData = quoteResult.transaction.data;

        // Generate attestation signature
        const totalVotesFor = ethers.parseEther("0.5");
        const totalVotesAgainst = 0;
        const messageHash = ethers.solidityPackedKeccak256(
            ["uint256", "uint256", "uint256", "bool"],
            [targetProposalId, totalVotesFor, totalVotesAgainst, true]
        );
        const attestationSignature = await aiAgent.signMessage(ethers.toBeArray(messageHash));

        // Execute Swap on policy using real Uniswap routing calldata
        const usdcContract = await ethers.getContractAt(
            ["function balanceOf(address) view returns (uint256)"],
            USDC_ADDRESS
        );
        const vaultUsdcBefore = await usdcContract.balanceOf(await treasuryVault.getAddress());
        const policyUsdcBefore = await usdcContract.balanceOf(await livePolicy.getAddress());
        const vaultWethBefore = await wethContract.balanceOf(await treasuryVault.getAddress());
        const policyWethBefore = await wethContract.balanceOf(await livePolicy.getAddress());

        const executeTx = await livePolicy.executeSwap(
            targetProposalId,
            WETH_ADDRESS,
            USDC_ADDRESS,
            ethers.parseEther("0.5"),
            totalVotesFor,
            totalVotesAgainst,
            attestationSignature,
            swapCallData
        );
        await executeTx.wait();

        // Verify output: vault should have received swapped USDC tokens
        const vaultUsdcAfter = await usdcContract.balanceOf(await treasuryVault.getAddress());
        const policyUsdcAfter = await usdcContract.balanceOf(await livePolicy.getAddress());
        const vaultWethAfter = await wethContract.balanceOf(await treasuryVault.getAddress());
        const policyWethAfter = await wethContract.balanceOf(await livePolicy.getAddress());

        expect(vaultUsdcAfter).to.be.above(vaultUsdcBefore);
        console.log(`          [SUCCESS] Live swap executed. Vault USDC increased by: ${ethers.formatUnits(vaultUsdcAfter - vaultUsdcBefore, 6)} USDC`);

        // --- Log Results to test/inputs/swap_results.txt ---
        fs.mkdirSync(path.join("test", "inputs"), { recursive: true });
        
        let swapLog = "==================================================\n";
        swapLog += "LIVE UNISWAP SEPOLIA FORK SWAP RESULTS\n";
        swapLog += `Timestamp: ${new Date().toISOString()}\n`;
        swapLog += `Universal Router: ${UNIVERSAL_ROUTER}\n`;
        swapLog += `WETH Token (In): ${WETH_ADDRESS}\n`;
        swapLog += `USDC Token (Out): ${USDC_ADDRESS}\n`;
        swapLog += "==================================================\n\n";
        swapLog += "BALANCE SHEET COMPARISON (BEFORE vs AFTER):\n\n";
        
        swapLog += "TreasuryVault (0x...):\n";
        swapLog += `  - WETH Balance:\n`;
        swapLog += `      * Before: ${ethers.formatEther(vaultWethBefore)} WETH\n`;
        swapLog += `      * After:  ${ethers.formatEther(vaultWethAfter)} WETH\n`;
        swapLog += `  - USDC Balance:\n`;
        swapLog += `      * Before: ${ethers.formatUnits(vaultUsdcBefore, 6)} USDC\n`;
        swapLog += `      * After:  ${ethers.formatUnits(vaultUsdcAfter, 6)} USDC (Received swapped funds!)\n\n`;

        swapLog += "AssestSwapPolicy (0x...):\n";
        swapLog += `  - WETH Balance:\n`;
        swapLog += `      * Before: ${ethers.formatEther(policyWethBefore)} WETH\n`;
        swapLog += `      * After:  ${ethers.formatEther(policyWethAfter)} WETH\n`;
        swapLog += `  - USDC Balance:\n`;
        swapLog += `      * Before: ${ethers.formatUnits(policyUsdcBefore, 6)} USDC\n`;
        swapLog += `      * After:  ${ethers.formatUnits(policyUsdcAfter, 6)} USDC\n\n`;

        fs.writeFileSync(path.join("test", "inputs", "swap_results.txt"), swapLog);
    });
});
