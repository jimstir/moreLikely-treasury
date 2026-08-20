import { expect } from "chai";
import { ethers } from "hardhat";
import { AIOwnerAgent, TreasuryGoals, TradeRecommendation } from "../../agent/aiAgent";

describe("AI Owner Agent Decision Loop & 0G Compute Suite", function () {
    let treasuryVault: any;
    let mockUsdc: any;
    let mockWeth: any;
    let agent: AIOwnerAgent;

    let owner: any;
    let stakeholder: any;
    let aiAgentSigner: any;

    const USDC_DECIMALS = 6;
    const WETH_DECIMALS = 18;

    beforeEach(async function () {
        [owner, stakeholder, aiAgentSigner] = await ethers.getSigners();

        // 1. Deploy Mock Tokens
        const MockUSDC = await ethers.getContractFactory("MockERC20");
        mockUsdc = await MockUSDC.deploy("Mock USDC", "USDC");
        await mockUsdc.waitForDeployment();

        const MockWETH = await ethers.getContractFactory("MockERC20");
        mockWeth = await MockWETH.deploy("Mock WETH", "WETH");
        await mockWeth.waitForDeployment();

        // 2. Deploy TreasuryToken (voting weight asset)
        const TreasuryToken = await ethers.getContractFactory("TreasuryToken");
        const treasuryToken = await TreasuryToken.deploy("Treasury Shares", "TRES", owner.address);
        await treasuryToken.waitForDeployment();

        // 3. Deploy TreasuryVault with MockUSDC as the underlying asset
        const TreasuryVault = await ethers.getContractFactory("TreasuryVault");
        // constructor: name, underlying tToken, name, symbol
        // For EIP-7425/Open Treasury: underlying token is TreasuryToken
        treasuryVault = await TreasuryVault.deploy(
            "AI Agent Treasury",
            await treasuryToken.getAddress(),
            await mockUsdc.getAddress(),
            100,
            "Proposal Shares",
            "VSHARE"
        );
        await treasuryVault.waitForDeployment();

        // Authorize vault to mint shares on TreasuryToken
        await (await treasuryToken.setVault(await treasuryVault.getAddress())).wait();

        // 4. Initialize AIOwnerAgent
        // Using local Hardhat RPC and the AI Agent Signer's private key
        // Note: For testing purposes, we use a mock/arbitrary EOA key for the agent wallet.
        const providerUrl = "http://127.0.0.1:8545";
        // Private key of the third Hardhat signer (aiAgentSigner)
        // Hardhat third EOA private key: "0x5de4111afa73d9b5c2f207f136e1c9e30a5f8c00224d080f4f9f74053e1a18bc"
        const agentPrivateKey = "0x5de4111afa73d9b5c2f207f136e1c9e30a5f8c00224d080f4f9f74053e1a18bc";
        
        // Fund the agent EOA with ETH for transaction gas
        const agentWallet = new ethers.Wallet(agentPrivateKey, ethers.provider);
        const fundTx = await owner.sendTransaction({
            to: agentWallet.address,
            value: ethers.parseEther("10")
        });
        await fundTx.wait();

        agent = new AIOwnerAgent(
            ethers.provider,
            agentPrivateKey,
            process.env.ZEROG_COMPUTE_API_KEY,
            process.env.ZEROG_COMPUTE_BASE_URL,
            "glm-5.2"
        );
    });

    it("should successfully monitor the current state of the treasury", async function () {
        const state = await agent.monitorCurrentState(await treasuryVault.getAddress());
        expect(state.assets).to.contain(await treasuryVault.asset());
        expect(state.balances).to.have.property(await treasuryVault.asset());
        expect(parseFloat(state.balances[await treasuryVault.asset()])).to.equal(0);
    });

    it("should reject trades that fail risk check requirements", async function () {
        const state = {
            assets: [await mockUsdc.getAddress(), await mockWeth.getAddress()],
            balances: {
                [await mockUsdc.getAddress()]: "10.0", // Only 10 USDC in vault
                [await mockWeth.getAddress()]: "0.0"
            }
        };

        const goals: TreasuryGoals = {
            maxTokenAllocationPercent: {
                [await mockWeth.getAddress()]: 40 // Limit WETH allocation to 40%
            },
            slippageTolerancePercent: 0.5,
            stopLossPercent: {}
        };

        // Case 1: Insufficient Balance Check
        const badTrade1: TradeRecommendation = {
            recommendTrade: true,
            tokenIn: await mockUsdc.getAddress(),
            tokenOut: await mockWeth.getAddress(),
            amountIn: "15.0", // Asks to swap 15.0 USDC, but vault only holds 10.0
            rationale: "Arbitrage swap opportunity"
        };
        const check1 = agent.riskCheck(badTrade1, state, goals);
        expect(check1.passed).to.be.false;
        expect(check1.reason).to.contain("Insufficient balance");

        // Case 2: Allocation Constraint Check
        const badTrade2: TradeRecommendation = {
            recommendTrade: true,
            tokenIn: await mockUsdc.getAddress(),
            tokenOut: await mockWeth.getAddress(),
            amountIn: "5.0",
            rationale: "Rebalance allocation"
        };
        const check2 = agent.riskCheck(badTrade2, state, goals);
        expect(check2.passed).to.be.false;
        expect(check2.reason).to.contain("violates maximum allocation limit");
    });

    it("should approve valid trades that satisfy all risk check criteria", async function () {
        const state = {
            assets: [await mockUsdc.getAddress(), await mockWeth.getAddress()],
            balances: {
                [await mockUsdc.getAddress()]: "100.0",
                [await mockWeth.getAddress()]: "0.0"
            }
        };

        const goals: TreasuryGoals = {
            maxTokenAllocationPercent: {
                [await mockWeth.getAddress()]: 60 // 60% allowed
            },
            slippageTolerancePercent: 0.5,
            stopLossPercent: {}
        };

        const goodTrade: TradeRecommendation = {
            recommendTrade: true,
            tokenIn: await mockUsdc.getAddress(),
            tokenOut: await mockWeth.getAddress(),
            amountIn: "10.0", // 10.0 < 100.0, and target allocation allows up to 60%
            rationale: "Yield optimization"
        };

        const check = agent.riskCheck(goodTrade, state, goals);
        expect(check.passed).to.be.true;
    });

    it("should successfully submit a trade proposal on-chain", async function () {
        // Approve mock token in vault first
        const addTokenTx = await treasuryVault.proposalOpen(
            0,
            ethers.ZeroAddress,
            owner.address,
            1, // ADD_TOKEN
            await mockUsdc.getAddress()
        );
        await addTokenTx.wait();
        const pId = await treasuryVault.proposalNum();
        await (await treasuryVault.newToken(await mockUsdc.getAddress(), pId)).wait();

        const trade: TradeRecommendation = {
            recommendTrade: true,
            tokenIn: await mockUsdc.getAddress(),
            tokenOut: await mockWeth.getAddress(),
            amountIn: "1.0",
            rationale: "Rebalance assets to optimize yield"
        };

        // Deploy swap policy
        const MockRouter = await ethers.getContractFactory("MockUniversalRouter");
        const mockRouter = await MockRouter.deploy(
            await mockUsdc.getAddress(),
            await mockWeth.getAddress(),
            ethers.parseEther("1")
        );
        await mockRouter.waitForDeployment();

        const AssetSwapPolicy = await ethers.getContractFactory("AssetSwapPolicy");
        const policy = await AssetSwapPolicy.deploy(
            await treasuryVault.getAddress(),
            await mockRouter.getAddress(),
            aiAgentSigner.address
        );
        await policy.waitForDeployment();

        // Submit proposal via AI Agent wallet EOA
        const txHash = await agent.proposeTrade(
            await treasuryVault.getAddress(),
            await policy.getAddress(),
            trade
        );
        expect(txHash).to.be.a("string");
        expect(txHash).to.have.lengthOf(66); // Valid tx hash length
    });
});
