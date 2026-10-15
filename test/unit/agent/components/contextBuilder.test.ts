import { expect } from "chai";
import { Orchestrator, ProviderType } from "../../../../agent/orchestrator";
import { ContextBuilder } from "../../../../agent/contextBuilder";
import * as fs from "fs";

describe("ContextBuilder Unit Tests", function () {
    let orchestrator: Orchestrator;
    let contextBuilder: ContextBuilder;

    beforeEach(function () {
        orchestrator = new Orchestrator(ProviderType.GEMINI_SUBSCRIBER);
        orchestrator['isSubscriber'] = true;
        contextBuilder = new ContextBuilder(orchestrator, "http://127.0.0.1:8545");
    });

    it("should successfully build context with policy rules and memory", async function () {
        const contextBuilderAny = contextBuilder as any;
        contextBuilderAny.monitorCurrentState = async () => ({
            assets: ["0xTokenA"],
            balances: { "0xTokenA": "100.0" }
        });

        const payload = await contextBuilder.buildContext("0xMockVault");
        expect(payload).to.have.property("onChainState");
        expect(payload).to.have.property("policyRules");
        expect(payload).to.have.property("agentMemory");
        expect(payload).to.have.property("memorySummary");
        expect(payload).to.have.property("enabledTasks");
        expect(payload.safeMode).to.be.false;
    });

    it("should activate SAFE_MODE when on-chain query fails", async function () {
        const contextBuilderAny = contextBuilder as any;
        contextBuilderAny.monitorCurrentState = async () => {
            throw new Error("RPC node timeout");
        };

        const payload = await contextBuilder.buildContext("0xMockVault");
        expect(payload.safeMode).to.be.true;
        expect(payload.safeModeReason).to.include("RPC connection or contract query failed");
        expect(payload.onChainState.assets).to.be.empty;
    });

    it("should activate SAFE_MODE when no on-chain assets are returned", async function () {
        const contextBuilderAny = contextBuilder as any;
        contextBuilderAny.monitorCurrentState = async () => ({
            assets: [],
            balances: {}
        });

        const payload = await contextBuilder.buildContext("0xMockVault");
        expect(payload.safeMode).to.be.true;
        expect(payload.safeModeReason).to.include("No on-chain assets or balances could be verified");
    });

    it("should filter policy rules when deployer disables tasks", function () {
        const contextBuilderAny = contextBuilder as any;
        const disabledLendingTasks = {
            stopLoss: true,
            rebalancing: true,
            lending: false
        };

        const rules = contextBuilderAny.loadPolicyStandards(disabledLendingTasks);
        expect(rules.lending).to.equal("");
        expect(rules.assetSwap).to.not.equal("");
    });

    it("should append deployer override note when stop-loss task is disabled", function () {
        const contextBuilderAny = contextBuilder as any;
        const disabledStopLoss = {
            stopLoss: false,
            rebalancing: true,
            lending: true
        };

        const rules = contextBuilderAny.loadPolicyStandards(disabledStopLoss);
        expect(rules.assetSwap).to.include("[DEPLOYER OVERRIDE]: Stop-loss policy is explicitly DISABLED by deployer");
    });

    it("should include customSkill when provided", function () {
        const contextBuilderAny = contextBuilder as any;
        const customSkillText = "# My Custom Strategy\nExecute DCA only on Wednesdays.";
        const rules = contextBuilderAny.loadPolicyStandards({ stopLoss: true }, customSkillText);

        expect(rules.customSkill).to.equal(customSkillText);
    });

    it("should summarize up to 5 historical decision reports chronologically", function () {
        const contextBuilderAny = contextBuilder as any;
        const mockReports = [
            { timeframe: "long-term", rationale: "Accumulate ETH", createdAt: new Date("2026-10-01") },
            { timeframe: "short-term", rationale: "Rebalance stablecoins", createdAt: new Date("2026-10-05") }
        ];

        const summary = contextBuilderAny.summarizeAgentMemory(mockReports);
        expect(summary).to.include("Historical Decision #1");
        expect(summary).to.include("Accumulate ETH");
        expect(summary).to.include("Historical Decision #2");
        expect(summary).to.include("Rebalance stablecoins");
    });
});
