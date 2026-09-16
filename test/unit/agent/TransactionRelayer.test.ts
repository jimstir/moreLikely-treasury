import { expect } from "chai";
import { TransactionRelayer } from "../../../agent/tools/TransactionRelayer";

describe("TransactionRelayer (Unit)", function () {
    let originalEnv: any;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it("should throw error if LOCAL_ETHERS mode but no private key", async function () {
        process.env.EXECUTION_MODE = "LOCAL_ETHERS";
        delete process.env.AGENT_PRIVATE_KEY;
        delete process.env.OWNER_PRIVATE_KEY;

        const relayer = new TransactionRelayer();
        
        try {
            await relayer.executeTransaction({
                targetContract: "0x0000000000000000000000000000000000000000",
                functionSignature: "dummy()",
                abiParameters: []
            });
            expect.fail("Should have thrown an error");
        } catch (error: any) {
            expect(error.message).to.include("AGENT_PRIVATE_KEY is missing");
        }
    });
});
