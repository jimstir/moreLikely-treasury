import { expect } from "chai";
import { Orchestrator, ProviderType } from "../../../agent/orchestrator";
import { ContextBuilder } from "../../../agent/contextBuilder";

describe("0G Network Pipeline", function () {
    let orchestrator: Orchestrator;
    let contextBuilder: ContextBuilder;

    beforeEach(function () {
        orchestrator = new Orchestrator(ProviderType.ZERO_G);
        contextBuilder = new ContextBuilder(orchestrator, "http://127.0.0.1:8545");
    });

    it("should fail initialization if 0G balance is insufficient", async function () {
        orchestrator['checkZeroGBalance'] = async () => 0.0;

        try {
            await orchestrator.initializeChecks();
            expect.fail("Should have thrown an error");
        } catch (e: any) {
            expect(e.message).to.equal("Insufficient 0G Network balance to execute inference.");
        }
    });

    it("should successfully build context WITHOUT private overrides for 0G Network", async function () {
        orchestrator['checkZeroGBalance'] = async () => 5.0;
        await orchestrator.initializeChecks();

        contextBuilder['monitorCurrentState'] = async () => ({ assets: [], balances: {} });
        
        // Spy on loadPrivateOverrides to ensure it is NOT called
        let wasPrivateCalled = false;
        contextBuilder['loadPrivateOverrides'] = async () => {
            wasPrivateCalled = true;
            return {};
        };

        await contextBuilder.buildContext("0xMockVault");
        expect(wasPrivateCalled).to.be.false;
    });
});
