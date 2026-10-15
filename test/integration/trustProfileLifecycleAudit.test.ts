import { expect } from "chai";
import {
    evaluateLifecycleHeuristics,
    ProposalLifecycleContext
} from "../../frontend/src/lib/ai-agent";

describe("Trust Profile Lifecycle Reasoning & Document Audit (Integration)", function () {
    const mockMandate = "The treasury mandate is to steadily accumulate blue-chip assets (ETH, BTC) with a minimum 6-month horizon and maintain strict stop-losses.";

    it("should flag proposals opened without verified DecisionReport documents", function () {
        const lifecycleContext: ProposalLifecycleContext = {
            proposals: [
                {
                    onChainId: 1,
                    proposerAddress: "0x1111",
                    recipientAddress: "0x2222",
                    withdrawAmount: 5.0,
                    targetToken: "0xWETH",
                    status: "pending",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    decisionReport: null // Missing document!
                }
            ]
        };

        const results = evaluateLifecycleHeuristics([], mockMandate, lifecycleContext);
        const trigger = results.find(r => r.attributeName === "Proposal Document Integrity");

        expect(trigger).to.exist;
        expect(trigger?.isTriggered).to.be.true;
        expect(trigger?.triggerDescription).to.include("#1 opened without verified DecisionReport documents");
    });

    it("should flag early quitting / abandonment of long-term strategies", function () {
        const now = Date.now();
        const openedAt = new Date(now - 3600 * 1000 * 2); // Opened 2 hours ago
        const closedAt = new Date(now);                   // Closed after 2 hours

        const lifecycleContext: ProposalLifecycleContext = {
            proposals: [
                {
                    onChainId: 2,
                    proposerAddress: "0x1111",
                    recipientAddress: "0x2222",
                    withdrawAmount: 10.0,
                    targetToken: "0xWETH",
                    status: "closed", // Abruptly closed
                    createdAt: openedAt,
                    updatedAt: closedAt,
                    decisionReport: {
                        rationale: "Strategic multi-year accumulation of WETH",
                        timeframe: "long-term", // Long-term declared
                        ticketReceipt: "0xreceipt123"
                    }
                }
            ]
        };

        const results = evaluateLifecycleHeuristics([], mockMandate, lifecycleContext);
        const trigger = results.find(r => r.attributeName === "Early Quitting & Strategy Abandonment");

        expect(trigger).to.exist;
        expect(trigger?.isTriggered).to.be.true;
        expect(trigger?.triggerDescription).to.include("Proposal(s) #2 declared a long-term timeframe but were abandoned early");
    });

    it("should flag high proposal churn rate and repeated undefined actions", function () {
        const lifecycleContext: ProposalLifecycleContext = {
            proposals: [
                { onChainId: 1, proposerAddress: "0x1", recipientAddress: "0x2", withdrawAmount: 1, targetToken: "0xT", status: "closed", createdAt: new Date(), updatedAt: new Date(), decisionReport: { rationale: "trade 1", timeframe: "short-term" } },
                { onChainId: 2, proposerAddress: "0x1", recipientAddress: "0x2", withdrawAmount: 1, targetToken: "0xT", status: "closed", createdAt: new Date(), updatedAt: new Date(), decisionReport: { rationale: "trade 2", timeframe: "short-term" } },
                { onChainId: 3, proposerAddress: "0x1", recipientAddress: "0x2", withdrawAmount: 1, targetToken: "0xT", status: "closed", createdAt: new Date(), updatedAt: new Date(), decisionReport: { rationale: "trade 3", timeframe: "short-term" } },
                { onChainId: 4, proposerAddress: "0x1", recipientAddress: "0x2", withdrawAmount: 1, targetToken: "0xT", status: "closed", createdAt: new Date(), updatedAt: new Date(), decisionReport: { rationale: "trade 4", timeframe: "short-term" } },
                { onChainId: 5, proposerAddress: "0x1", recipientAddress: "0x2", withdrawAmount: 1, targetToken: "0xT", status: "executed", createdAt: new Date(), updatedAt: new Date(), decisionReport: { rationale: "trade 5", timeframe: "short-term" } },
            ]
        };

        const results = evaluateLifecycleHeuristics([], mockMandate, lifecycleContext);
        const trigger = results.find(r => r.attributeName === "Repeated Undefined & Churn Actions");

        expect(trigger).to.exist;
        expect(trigger?.isTriggered).to.be.true;
        expect(trigger?.triggerDescription).to.include("High proposal churn rate (80% closed without completion)");
    });

    it("should pass cleanly when proposals are documented and aligned", function () {
        const lifecycleContext: ProposalLifecycleContext = {
            proposals: [
                {
                    onChainId: 10,
                    proposerAddress: "0x1",
                    recipientAddress: "0x2",
                    withdrawAmount: 5.0,
                    targetToken: "0xWETH",
                    status: "approved",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    decisionReport: {
                        rationale: "Rebalance 5% into WETH per mandate target allocation",
                        timeframe: "short-term",
                        ticketReceipt: "0xvalidReceipt"
                    }
                }
            ]
        };

        const results = evaluateLifecycleHeuristics([], mockMandate, lifecycleContext);
        expect(results).to.be.an("array").that.is.empty;
    });
});
