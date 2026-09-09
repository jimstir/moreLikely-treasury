import { expect } from "chai";
import { Orchestrator, ProviderType } from "../../../agent/orchestrator";
import { ContextBuilder } from "../../../agent/contextBuilder";

describe("Private Provider Pipeline", function () {
    let orchestrator: Orchestrator;
    let contextBuilder: ContextBuilder;

    beforeEach(function () {
        orchestrator = new Orchestrator(ProviderType.PRIVATE);
        contextBuilder = new ContextBuilder(orchestrator, "http://127.0.0.1:8545");
    });

    it("should bypass platform billing checks successfully", async function () {
        let checkCalled = false;
        orchestrator['checkOnChainSubscription'] = async () => { checkCalled = true; return false; };
        orchestrator['checkZeroGBalance'] = async () => { checkCalled = true; return 0; };

        // For private providers, it should simply succeed without calling external checks
        await orchestrator.initializeChecks();
        expect(checkCalled).to.be.false;
        expect(orchestrator.getProviderType()).to.equal(ProviderType.PRIVATE);
    });
});
