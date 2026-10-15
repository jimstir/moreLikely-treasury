import { expect } from "chai";
import { ethers } from "ethers";

describe("Private Receipt Verification (Integration)", function () {
    let agentWallet: ethers.HDNodeWallet;
    let unauthorizedWallet: ethers.HDNodeWallet;

    before(function () {
        agentWallet = ethers.Wallet.createRandom();
        unauthorizedWallet = ethers.Wallet.createRandom();
    });

    it("should generate a valid EIP-191 signature and verify against registered agent address", async function () {
        const treasuryId = "treasury-uuid-1234";
        const invocationId = "inv-998877";
        const transcriptHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        const timestamp = 1700000000;

        const message = `${treasuryId}:${invocationId}:${transcriptHash}:${timestamp}`;
        const signature = await agentWallet.signMessage(message);

        const recovered = ethers.verifyMessage(message, signature);
        expect(recovered.toLowerCase()).to.equal(agentWallet.address.toLowerCase());
    });

    it("should reject signature when signed by an unauthorized wallet", async function () {
        const treasuryId = "treasury-uuid-1234";
        const invocationId = "inv-998877";
        const transcriptHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        const timestamp = 1700000000;

        const message = `${treasuryId}:${invocationId}:${transcriptHash}:${timestamp}`;
        const badSignature = await unauthorizedWallet.signMessage(message);

        const recovered = ethers.verifyMessage(message, badSignature);
        expect(recovered.toLowerCase()).to.not.equal(agentWallet.address.toLowerCase());
    });

    it("should detect tampering with message parameters", async function () {
        const treasuryId = "treasury-uuid-1234";
        const invocationId = "inv-998877";
        const transcriptHash = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
        const timestamp = 1700000000;

        const message = `${treasuryId}:${invocationId}:${transcriptHash}:${timestamp}`;
        const signature = await agentWallet.signMessage(message);

        // Tamper with timestamp
        const tamperedMessage = `${treasuryId}:${invocationId}:${transcriptHash}:${timestamp + 10}`;
        const recovered = ethers.verifyMessage(tamperedMessage, signature);
        expect(recovered.toLowerCase()).to.not.equal(agentWallet.address.toLowerCase());
    });
});
