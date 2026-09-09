import { expect } from "chai";
import { Executor } from "../../../agent/executor";
import { PolicyActionRecommendation, TreasuryGoals } from "../../../agent/interfaces";

describe("Executor Unit Tests", function () {
    let executor: Executor;

    beforeEach(function () {
        executor = new Executor(null, null); // We don't need Circle SDK for risk checks
    });

    it("should reject an action if recommendAction is false", function () {
        const recommendation: PolicyActionRecommendation = {
            recommendAction: false,
            actionType: "NONE",
            rationale: "No action needed."
        };
        const goals: TreasuryGoals = { maxTokenAllocationPercent: {}, slippageTolerancePercent: 1, stopLossPercent: {} };

        const result = executor.riskCheck(recommendation, {}, goals);
        expect(result.passed).to.be.false;
        expect(result.reason).to.equal("No action recommended by LLM.");
    });

    it("should reject an ASSET_SWAP if the amount violates max allocation", function () {
        const recommendation: PolicyActionRecommendation = {
            recommendAction: true,
            actionType: "ASSET_SWAP",
            tokenIn: "USDC",
            tokenOut: "WETH",
            amountIn: "10.0",
            rationale: "Testing allocation limits."
        };
        const stateBalances = { "USDC": "100.0" };
        const goals: TreasuryGoals = {
            maxTokenAllocationPercent: { "WETH": 40 }, // Under 50% fails in current hardcoded risk logic
            slippageTolerancePercent: 1,
            stopLossPercent: {}
        };

        const result = executor.riskCheck(recommendation, stateBalances, goals);
        expect(result.passed).to.be.false;
        expect(result.reason).to.contain("violates maximum allocation limit");
    });
});
