import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import * as fs from "fs";
import * as path from "path";

describe("Live Uniswap Sepolia Fork Test Suite", function () {
    let owner: Signer;
    let stakeholder: Signer;
    let aiAgent: Signer;
    let ownerAddress: string;
    let stakeholderAddress: string;
    let aiAgentAddress: string;

    let treasuryVault: any;
    let treasuryToken: any;

    beforeEach(async function () {
        [owner, stakeholder, aiAgent] = await ethers.getSigners();
        ownerAddress = await owner.getAddress();
        stakeholderAddress = await stakeholder.getAddress();
        aiAgentAddress = await aiAgent.getAddress();

        // Deploy TreasuryToken
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        treasuryToken = await TreasuryToken.deploy("Treasury Shares", "TRES", ownerAddress);
        await treasuryToken.waitForDeployment();

        // Deploy TreasuryVault
        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
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
    });

    it("should execute a live swap on Sepolia Fork using Uniswap Swapping API transaction data", async function () {
        const apiKey = process.env.UNISWAP_API_KEY;
        expect(apiKey, "UNISWAP_API_KEY must be configured in your .env file to run live Uniswap tests").to.not.be.undefined;
        expect(apiKey, "UNISWAP_API_KEY cannot be empty").to.not.equal("");

        const WETH_ADDRESS = "0x7b79995e5f793a07bc00c21412e50ecae098e7f9";
        const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
        const UNIVERSAL_ROUTER = "0x3fc91a3afd20baba244d2e0e97e68207d094d29c";

        // Deploy a policy contract configured with the real Sepolia Universal Router
        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        const livePolicy = await AssetSwapPolicy.deploy(
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
        const depositTx = await wethContract.connect(stakeholder).deposit({ value: ethers.parseEther("0.001") });
        await depositTx.wait();

        // Stakeholder joins treasury with 0.001 WETH
        const approveTx = await wethContract.connect(stakeholder).approve(await treasuryVault.getAddress(), ethers.parseEther("0.001"));
        await approveTx.wait();

        const joinTx = await treasuryVault.connect(stakeholder).joinTreasury(WETH_ADDRESS, ethers.parseEther("0.001"), false, 0);
        await joinTx.wait();

        // Open a proposal to swap 0.0005 WETH for USDC
        const targetProposalId = 1;
        await (
            await treasuryVault.proposalOpen(
                ethers.parseEther("0.0005"),
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
                .approve(await treasuryVault.getAddress(), ethers.parseEther("0.0005"))
        ).wait();
        await (
            await treasuryVault
                .connect(stakeholder)
                .proposalDeposit(ethers.parseEther("0.0005"), stakeholderAddress, targetProposalId)
        ).wait();

        // Execute proposal on vault (moves WETH to policy contract)
        await (await treasuryVault.proposalApproved(targetProposalId)).wait();

        // Verify livePolicy contract holds the WETH
        expect(await wethContract.balanceOf(await livePolicy.getAddress())).to.equal(ethers.parseEther("0.0005"));

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
                amount: ethers.parseEther("0.0005").toString(),
                type: "EXACT_INPUT",
                recipient: await livePolicy.getAddress(),
                slippageTolerance: "0.5"
            })
        });

        const quoteResult = await response.json();
        expect(response.ok, `Uniswap API call failed. Details: ${JSON.stringify(quoteResult)}`).to.be.true;

        const swapCallData = quoteResult.transaction.data;

        // Generate attestation signature
        const totalVotesFor = ethers.parseEther("0.0005");
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
            ethers.parseEther("0.0005"),
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

        swapLog += "AssetSwapPolicy (0x...):\n";
        swapLog += `  - WETH Balance:\n`;
        swapLog += `      * Before: ${ethers.formatEther(policyWethBefore)} WETH\n`;
        swapLog += `      * After:  ${ethers.formatEther(policyWethAfter)} WETH\n`;
        swapLog += `  - USDC Balance:\n`;
        swapLog += `      * Before: ${ethers.formatUnits(policyUsdcBefore, 6)} USDC\n`;
        swapLog += `      * After:  ${ethers.formatUnits(policyUsdcAfter, 6)} USDC\n\n`;

        fs.writeFileSync(path.join("test", "inputs", "swap_results.txt"), swapLog);
    });
});
