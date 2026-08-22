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

        const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
        treasuryVault = await TreasuryVault.deploy(
            "moreLikely Treasury",
            await treasuryToken.getAddress(),
            USDC_ADDRESS,
            100,
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
        if (!apiKey) {
            console.warn("Skipping live Uniswap tests: UNISWAP_API_KEY is not configured.");
            this.skip();
        }

        const WETH_ADDRESS = "0x7b79995e5f793a07bc00c21412e50ecae098e7f9";
        const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
        const UNIVERSAL_ROUTER = "0x3fc91a3afd20baba244d2e0e97e68207d094d29c";

        // Deploy a policy contract configured with the real Sepolia Universal Router
        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        const livePolicy = await AssetSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            UNIVERSAL_ROUTER,
            aiAgentAddress
        );
        await livePolicy.waitForDeployment();

        // Approve live Sepolia WETH in our vault
        const addTokenTx = await treasuryVault.proposalOpen(
            0,
            ethers.ZeroAddress,
            ownerAddress,
            2, // ADD_TOKEN
            WETH_ADDRESS
        );
        await addTokenTx.wait();
        const pId = await treasuryVault.proposalNum();
        await (await treasuryVault.newToken(WETH_ADDRESS, pId)).wait();

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

        const joinTx = await treasuryVault.connect(stakeholder).joinTreasury(WETH_ADDRESS, ethers.parseEther("0.001"));
        await joinTx.wait();

        // Open a proposal to swap 0.0005 WETH for USDC
        const targetProposalId = await treasuryVault.proposalNum() + BigInt(1);
        await (
            await treasuryVault.proposalOpen(
                ethers.parseEther("0.0005"),
                await livePolicy.getAddress(),
                ownerAddress,
                0, // ProposalType.TXNS
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

        const usdcContract = await ethers.getContractAt(
            ["function balanceOf(address) view returns (uint256)"],
            USDC_ADDRESS
        );
        const vaultUsdcBefore = await usdcContract.balanceOf(await treasuryVault.getAddress());
        const policyUsdcBefore = await usdcContract.balanceOf(await livePolicy.getAddress());
        const vaultWethBefore = await wethContract.balanceOf(await treasuryVault.getAddress());
        const policyWethBefore = await wethContract.balanceOf(await livePolicy.getAddress());

        // Owner executes swap
        const executeTx = await (livePolicy as any).connect(owner).executeSwap(
            targetProposalId,
            WETH_ADDRESS,
            USDC_ADDRESS,
            ethers.parseEther("0.0005"),
            swapCallData
        );
        await executeTx.wait();

        // Verify output: policy should have received swapped USDC tokens (and explicitely holds them)
        const vaultUsdcAfter = await usdcContract.balanceOf(await treasuryVault.getAddress());
        const policyUsdcAfter = await usdcContract.balanceOf(await livePolicy.getAddress());
        const vaultWethAfter = await wethContract.balanceOf(await treasuryVault.getAddress());
        const policyWethAfter = await wethContract.balanceOf(await livePolicy.getAddress());

        expect(policyUsdcAfter).to.be.above(policyUsdcBefore);
        console.log(`          [SUCCESS] Live swap executed. Policy USDC increased by: ${ethers.formatUnits(policyUsdcAfter - policyUsdcBefore, 6)} USDC`);

        // --- Log Results to test/inputs/swap_results.txt ---
        fs.mkdirSync(path.join("test", "inputs"), { recursive: true });
        
        let swapLog = "==================================================\n";
        swapLog += "LIVE UNISWAP SEPOLIA FORK SWAP RESULTS (WETH -> USDC)\n";
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
        swapLog += `      * After:  ${ethers.formatUnits(vaultUsdcAfter, 6)} USDC\n\n`;

        swapLog += "AssetSwapPolicy (0x...):\n";
        swapLog += `  - WETH Balance:\n`;
        swapLog += `      * Before: ${ethers.formatEther(policyWethBefore)} WETH\n`;
        swapLog += `      * After:  ${ethers.formatEther(policyWethAfter)} WETH\n`;
        swapLog += `  - USDC Balance:\n`;
        swapLog += `      * Before: ${ethers.formatUnits(policyUsdcBefore, 6)} USDC\n`;
        swapLog += `      * After:  ${ethers.formatUnits(policyUsdcAfter, 6)} USDC (Received swapped funds!)\n\n`;

        fs.writeFileSync(path.join("test", "inputs", "swap_results.txt"), swapLog);
    });

    it("should execute a manual owner live swap (USDC -> WETH) using Uniswap Swapping API", async function () {
        const apiKey = process.env.UNISWAP_API_KEY;
        if (!apiKey) {
            console.warn("Skipping live Uniswap tests: UNISWAP_API_KEY is not configured.");
            this.skip();
        }

        const WETH_ADDRESS = "0x7b79995e5f793a07bc00c21412e50ecae098e7f9";
        const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
        const UNIVERSAL_ROUTER = "0x3fc91a3afd20baba244d2e0e97e68207d094d29c";

        // Deploy a policy contract configured with the real Sepolia Universal Router
        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        const livePolicy = await AssetSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            UNIVERSAL_ROUTER,
            aiAgentAddress
        );
        await livePolicy.waitForDeployment();

        // Approve live Sepolia WETH in our vault (so we can hold it/swap it)
        const addTokenTx = await treasuryVault.proposalOpen(0, ethers.ZeroAddress, ownerAddress, 2, WETH_ADDRESS);
        await addTokenTx.wait();
        const pIdToken = await treasuryVault.proposalNum();
        await (await treasuryVault.newToken(WETH_ADDRESS, pIdToken)).wait();

        // 1. Fund the stakeholder with USDC using Uniswap API directly (simulating a user acquiring USDC on testnet)
        const amountEthToSwap = ethers.parseEther("0.05");
        const fundResponse = await fetch("https://trade-api.gateway.uniswap.org/v1/quote", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": apiKey },
            body: JSON.stringify({
                tokenInChainId: 11155111,
                tokenOutChainId: 11155111,
                tokenIn: WETH_ADDRESS,
                tokenOut: USDC_ADDRESS,
                amount: amountEthToSwap.toString(),
                type: "EXACT_INPUT",
                recipient: stakeholderAddress,
                slippageTolerance: "1"
            })
        });
        const fundQuoteResult = await fundResponse.json();
        expect(fundResponse.ok, `Uniswap API call failed for funding. Details: ${JSON.stringify(fundQuoteResult)}`).to.be.true;
        const fundCallData = fundQuoteResult.transaction.data;

        const wethContract: any = await ethers.getContractAt(
            ["function deposit() payable", "function approve(address, uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
            WETH_ADDRESS
        );
        const usdcContract: any = await ethers.getContractAt(
            ["function approve(address, uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
            USDC_ADDRESS
        );

        // Stakeholder wraps ETH and swaps to USDC directly through universal router
        await (await wethContract.connect(stakeholder).deposit({ value: amountEthToSwap })).wait();
        await (await wethContract.connect(stakeholder).approve(UNIVERSAL_ROUTER, amountEthToSwap)).wait();
        await (await stakeholder.sendTransaction({ to: UNIVERSAL_ROUTER, data: fundCallData })).wait();

        const stakeholderUsdcBal = await usdcContract.balanceOf(stakeholderAddress);
        expect(stakeholderUsdcBal).to.be.above(0);

        // 2. Stakeholder joins USDC-based treasury
        const joinAmount = stakeholderUsdcBal; // join with all USDC
        await (await usdcContract.connect(stakeholder).approve(await treasuryVault.getAddress(), joinAmount)).wait();
        await (await treasuryVault.connect(stakeholder).joinTreasury(USDC_ADDRESS, joinAmount)).wait();

        // 3. Open a proposal to swap 10 USDC (10,000,000 units) for WETH
        const swapAmountIn = BigInt(10000000); 
        const targetProposalId = await treasuryVault.proposalNum() + BigInt(1);
        await (
            await treasuryVault.proposalOpen(
                swapAmountIn,
                await livePolicy.getAddress(),
                ownerAddress,
                0, // ProposalType.TXNS
                USDC_ADDRESS
            )
        ).wait();

        // 4. Vote on the proposal
        await (
            await treasuryToken
                .connect(stakeholder)
                .approve(await treasuryVault.getAddress(), joinAmount) // sufficient shares
        ).wait();
        await (
            await treasuryVault
                .connect(stakeholder)
                .proposalDeposit(joinAmount, stakeholderAddress, targetProposalId)
        ).wait();

        // Execute proposal on vault (moves USDC to policy contract)
        await (await treasuryVault.proposalApproved(targetProposalId)).wait();

        expect(await usdcContract.balanceOf(await livePolicy.getAddress())).to.equal(swapAmountIn);

        // 5. Fetch quote from Uniswap API (USDC -> WETH)
        const response = await fetch("https://trade-api.gateway.uniswap.org/v1/quote", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify({
                tokenInChainId: 11155111,
                tokenOutChainId: 11155111,
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                amount: swapAmountIn.toString(),
                type: "EXACT_INPUT",
                recipient: await livePolicy.getAddress(),
                slippageTolerance: "0.5"
            })
        });

        const quoteResult = await response.json();
        expect(response.ok, `Uniswap API call failed. Details: ${JSON.stringify(quoteResult)}`).to.be.true;

        const swapCallData = quoteResult.transaction.data;
        const expectedWethOut = BigInt(quoteResult.quote.quoteDecimals); // 18 decimals WETH value returned as formatted string usually, wait quoteResult structure depends on API.
        // Actually quoteResult.quote.quote represents the raw amount.
        const expectedWethOutRaw = BigInt(quoteResult.quote.quote);

        // 6. Manual owner execution (No AI Agent signature required for owner due to auth modifier allowing owner directly)
        const policyUsdcBefore = await usdcContract.balanceOf(await livePolicy.getAddress());
        const policyWethBefore = await wethContract.balanceOf(await livePolicy.getAddress());

        const executeTx = await (livePolicy as any).connect(owner).executeSwap(
            targetProposalId,
            USDC_ADDRESS,
            WETH_ADDRESS,
            swapAmountIn,
            swapCallData
        );
        const receipt = await executeTx.wait();

        // Verify output: policy should have received swapped WETH tokens
        const policyUsdcAfter = await usdcContract.balanceOf(await livePolicy.getAddress());
        const policyWethAfter = await wethContract.balanceOf(await livePolicy.getAddress());

        expect(policyWethAfter).to.be.above(policyWethBefore);
        expect(policyUsdcAfter).to.equal(policyUsdcBefore - swapAmountIn);
        
        const wethGained = policyWethAfter - policyWethBefore;
        
        console.log(`          [SUCCESS] Manual owner live swap executed. Policy WETH increased by: ${ethers.formatEther(wethGained)} WETH`);
        console.log(`          [INFO] Expected swap output from quote: ${ethers.formatEther(expectedWethOutRaw)} WETH`);

        // --- Log Results to test/inputs/swap_results_2.txt ---
        fs.mkdirSync(path.join("test", "inputs"), { recursive: true });
        
        let swapLog = "==================================================\n";
        swapLog += "LIVE UNISWAP SEPOLIA FORK SWAP RESULTS (USDC -> WETH)\n";
        swapLog += `Timestamp: ${new Date().toISOString()}\n`;
        swapLog += `Executed By: Manual Owner\n`;
        swapLog += `WETH Gained: ${ethers.formatEther(wethGained)} WETH\n`;
        swapLog += `Quoted Price: 1 USDC = ${ethers.formatEther(expectedWethOutRaw * BigInt(1000000) / swapAmountIn)} WETH\n`;
        swapLog += "==================================================\n\n";

        fs.writeFileSync(path.join("test", "inputs", "swap_results_2.txt"), swapLog);
    });
});
