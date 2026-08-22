import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";
import * as fs from "fs";
import * as path from "path";

const DEPLOYMENTS_FILE = path.join(__dirname, "testnet-deployments.json");

describe("Live Sepolia Testnet Sweep (Test #3)", function () {
    let owner: Signer;
    let stakeholders: Signer[] = [];
    let ownerAddress: string;

    let treasuryVault: any;
    let treasuryToken: any;
    let livePolicy: any;

    let currentRun: any;
    let runIndex: number;

    const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
    const WETH_ADDRESS = "0x7b79995e5f793a07bc00c21412e50ecae098e7f9";
    const UNIVERSAL_ROUTER = "0x3fc91a3afd20baba244d2e0e97e68207d094d29c";

    before(async function () {
        // Load run data
        const runId = process.env.TESTNET_RUN_ID;
        if (!runId) {
            throw new Error("TESTNET_RUN_ID is not set in environment.");
        }

        const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
        runIndex = deployments.findIndex((d: any) => d.id === runId);
        currentRun = deployments[runIndex];

        if (!currentRun) throw new Error("Run not found in registry.");

        // Setup signers
        const provider = ethers.provider;
        owner = new ethers.Wallet(currentRun.ownerKey, provider);
        ownerAddress = await owner.getAddress();

        for (const pk of currentRun.stakeholders) {
            stakeholders.push(new ethers.Wallet(pk, provider));
        }
    });

    it("should manage live deployment or reuse existing", async function () {
        if (!currentRun.contracts || !currentRun.contracts.TreasuryToken) {
            console.log("          => No existing contracts found. Deploying new contracts to Sepolia...");
            const TreasuryToken = await ethers.getContractFactory("TreasuryToken", owner);
            treasuryToken = await TreasuryToken.deploy("Treasury Shares", "TRES", ownerAddress);
            await treasuryToken.waitForDeployment();
            const tokenAddr = await treasuryToken.getAddress();

            const TreasuryVault = await ethers.getContractFactory("TreasuryVault", owner);
            treasuryVault = await TreasuryVault.deploy(
                "moreLikely Treasury",
                tokenAddr,
                USDC_ADDRESS,
                100,
                "Vault Shares",
                "VSHARE"
            );
            await treasuryVault.waitForDeployment();
            const vaultAddr = await treasuryVault.getAddress();

            await (await treasuryToken.setVault(vaultAddr)).wait(1);

            const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy", owner);
            // No AI agent for this test, pass zero address or owner address
            livePolicy = await AssetSwapPolicy.deploy(vaultAddr, UNIVERSAL_ROUTER, ethers.ZeroAddress);
            await livePolicy.waitForDeployment();
            const policyAddr = await livePolicy.getAddress();

            // Save contracts to registry
            currentRun.contracts = {
                TreasuryToken: tokenAddr,
                TreasuryVault: vaultAddr,
                AssetSwapPolicy: policyAddr
            };
            const deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS_FILE, "utf-8"));
            deployments[runIndex] = currentRun;
            fs.writeFileSync(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));
            console.log("          => Contracts deployed and saved to registry.");
            
            // Add WETH to Vault
            const addTokenTx = await treasuryVault.proposalOpen(0, ethers.ZeroAddress, ownerAddress, 2, WETH_ADDRESS);
            await addTokenTx.wait(1);
            const pIdToken = await treasuryVault.proposalNum();
            await (await treasuryVault.newToken(WETH_ADDRESS, pIdToken)).wait(1);
            
            console.log("          => Vault configured for WETH.");
        } else {
            console.log("          => Reusing existing contracts from registry.");
            treasuryToken = await ethers.getContractAt("TreasuryToken", currentRun.contracts.TreasuryToken, owner);
            treasuryVault = await ethers.getContractAt("TreasuryVault", currentRun.contracts.TreasuryVault, owner);
            livePolicy = await ethers.getContractAt("AssetSwapPolicy", currentRun.contracts.AssetSwapPolicy, owner);
        }
    });

    it("should allow all stakeholders to join and vote on manual owner swap", async function () {
        const apiKey = process.env.UNISWAP_API_KEY;
        if (!apiKey) throw new Error("UNISWAP_API_KEY is not configured.");

        const usdcContract: any = await ethers.getContractAt(
            ["function approve(address, uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
            USDC_ADDRESS
        );

        // Stakeholders join
        console.log(`          => Joining ${stakeholders.length} stakeholders...`);
        for (const sh of stakeholders) {
            const shAddr = await sh.getAddress();
            const usdcBal = await usdcContract.balanceOf(shAddr);
            
            // Note: Since this is live, we check if they already have treasury tokens to avoid double joining if resuming
            const tBal = await treasuryToken.balanceOf(shAddr);
            if (tBal === BigInt(0)) {
                // Join with all their USDC
                await (await usdcContract.connect(sh).approve(await treasuryVault.getAddress(), usdcBal)).wait(1);
                await (await treasuryVault.connect(sh).joinTreasury(USDC_ADDRESS, usdcBal)).wait(1);
                console.log(`             - ${shAddr} joined with ${ethers.formatUnits(usdcBal, 6)} USDC.`);
            } else {
                console.log(`             - ${shAddr} is already in the treasury.`);
            }
        }

        // Open proposal
        console.log("          => Opening swap proposal (10 USDC -> WETH)...");
        const swapAmountIn = BigInt(10000000); // 10 USDC
        const targetProposalId = await treasuryVault.proposalNum() + BigInt(1);
        await (
            await treasuryVault.proposalOpen(
                swapAmountIn,
                await livePolicy.getAddress(),
                ownerAddress,
                0, // ProposalType.TXNS
                USDC_ADDRESS
            )
        ).wait(1);

        // Vote
        console.log("          => Stakeholders voting...");
        for (const sh of stakeholders) {
            const shAddr = await sh.getAddress();
            const tBal = await treasuryToken.balanceOf(shAddr);
            await (await treasuryToken.connect(sh).approve(await treasuryVault.getAddress(), tBal)).wait(1);
            await (await treasuryVault.connect(sh).proposalDeposit(tBal, shAddr, targetProposalId)).wait(1);
        }

        // Execute vault proposal
        console.log("          => Executing Vault Proposal to move funds to policy...");
        await (await treasuryVault.proposalApproved(targetProposalId)).wait(1);

        // Fetch quote
        console.log("          => Fetching live Uniswap API Quote...");
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
                slippageTolerance: "1"
            })
        });

        const quoteResult = await response.json();
        expect(response.ok, `Uniswap API call failed. Details: ${JSON.stringify(quoteResult)}`).to.be.true;
        const swapCallData = quoteResult.transaction.data;

        const wethContract = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], WETH_ADDRESS);
        const policyUsdcBefore = await usdcContract.balanceOf(await livePolicy.getAddress());
        const policyWethBefore = await wethContract.balanceOf(await livePolicy.getAddress());

        // Execute Swap on Policy
        console.log("          => Owner manually executing swap on live Uniswap router...");
        const executeTx = await livePolicy.connect(owner).executeSwap(
            targetProposalId,
            USDC_ADDRESS,
            WETH_ADDRESS,
            swapAmountIn,
            swapCallData
        );
        await executeTx.wait(1);

        const policyUsdcAfter = await usdcContract.balanceOf(await livePolicy.getAddress());
        const policyWethAfter = await wethContract.balanceOf(await livePolicy.getAddress());

        expect(policyWethAfter).to.be.above(policyWethBefore);
        expect(policyUsdcAfter).to.equal(policyUsdcBefore - swapAmountIn);
        
        const wethGained = policyWethAfter - policyWethBefore;
        console.log(`          [SUCCESS] Manual owner live testnet swap completed! WETH Gained: ${ethers.formatEther(wethGained)} WETH`);
    });
});
