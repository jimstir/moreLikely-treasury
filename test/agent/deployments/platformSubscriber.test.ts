import { expect } from "chai";
import { Orchestrator, ProviderType } from "../../../agent/orchestrator";
import { ContextBuilder } from "../../../agent/contextBuilder";
import { ReasoningEngine } from "../../../agent/reasoningEngine";
import { Executor } from "../../../agent/executor";

// Mocking dependencies for testing without live LLMs or on-chain calls
class MockLLMProvider {
    async requestInference(prompt: string) {
        return {
            textResponse: JSON.stringify({
                recommendAction: true,
                actionType: "ASSET_SWAP",
                tokenIn: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
                tokenOut: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
                amountIn: "100.0",
                rationale: "Testing platform subscriber pipeline."
            })
        };
    }
}

class MockCircleClient {
    async createContractExecutionTransaction(params: any) {
        return { data: { id: "mock-tx-id-12345" } };
    }
}

describe("Platform Subscriber Pipeline", function () {
    let orchestrator: Orchestrator;
    let contextBuilder: ContextBuilder;
    let reasoningEngine: ReasoningEngine;
    let executor: Executor;

    beforeEach(function () {
        orchestrator = new Orchestrator(ProviderType.GEMINI_SUBSCRIBER);
        
        // Use a mock RPC URL or local hardhat node for ContextBuilder
        contextBuilder = new ContextBuilder(orchestrator, "http://127.0.0.1:8545");
        
        reasoningEngine = new ReasoningEngine(new MockLLMProvider() as any);
        executor = new Executor(new MockCircleClient(), "mock-wallet-id");
    });

    it("should successfully run the full execution pipeline for a Platform Subscriber", async function () {
        // 1. Initialize Checks (Will pass because we mock the on-chain subscription check)
        // We override the method just for testing
        orchestrator['checkOnChainSubscription'] = async () => true;
        await orchestrator.initializeChecks();
        expect(orchestrator.getIsSubscriber()).to.be.true;

        // 2. Build Context (Mocking the on-chain state fetch to prevent network calls)
        contextBuilder['monitorCurrentState'] = async () => ({
            assets: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"],
            balances: {
                "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "1000.0"
            }
        });
        const contextPayload = await contextBuilder.buildContext("0xMockVault");

        // The subscriber should have private overrides applied
        expect(contextPayload.policyRules.assetSwap).to.be.a("string");

        // 3. Reason
        const recommendation = await reasoningEngine.evaluateTrade(contextPayload, { prices: {}, liquidity: {} });
        expect(recommendation.actionType).to.equal("ASSET_SWAP");
        expect(recommendation.amountIn).to.equal("100.0");

        // 4. Execute
        const goals = {
            maxTokenAllocationPercent: {
                "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": 50
            },
            slippageTolerancePercent: 1,
            stopLossPercent: {}
        };

        const riskCheckResult = executor.riskCheck(recommendation, contextPayload.onChainState.balances, goals);
        expect(riskCheckResult.passed).to.be.true;

        const txId = await executor.generateProposal("0xMockVault", "0xMockPolicy", recommendation);
        expect(txId).to.equal("mock-tx-id-12345");
    });
});
