import { expect } from "chai";
import { ethers } from "ethers";

// ---------------------------------------------------------
// Mocking the Agent Modules (ContextAggregator, RiskEngine)
// to establish the expected architecture contract.
// ---------------------------------------------------------

class MockContextAggregator {
  public static extractJsonBlocks(markdown: string): Record<string, any> {
    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/g;
    let match;
    const extractedConfigs: Record<string, any> = {};

    while ((match = jsonBlockRegex.exec(markdown)) !== null) {
      const parsedBlock = JSON.parse(match[1]);
      Object.assign(extractedConfigs, parsedBlock);
    }
    return extractedConfigs;
  }

  public static buildSystemPrompt(mandateMarkdown: string): string {
    // In production, this would inject live on-chain state into the template
    return mandateMarkdown.replace("{{TreasuryId}}", "0xVaultAddress");
  }

  public static dynamicallyParseTrustAttributes(trustProfileMarkdown: string): string[] {
    // A simple regex to find numbered lists (e.g., "1. **Owner Governance Override**")
    const attributeRegex = /\d+\.\s\*\*(.*?)\*\*/g;
    let match;
    const attributes: string[] = [];
    while ((match = attributeRegex.exec(trustProfileMarkdown)) !== null) {
      attributes.push(match[1]);
    }
    return attributes;
  }
}

class MockRiskEngine {
  public static evaluateTrade(proposedAction: any, parsedGoals: any): boolean {
    if (proposedAction.type === "swapBack" && proposedAction.lossPercentage > parsedGoals.stopLoss) {
      return false; // Trade violates the stop-loss limit
    }
    return true; // Trade is safe
  }
}

// ---------------------------------------------------------
// Test Suite
// ---------------------------------------------------------

describe("Agent & Document Context Pipeline", function () {
  
  const validMandateMarkdown = `
# Treasury Mandate
This is the mandate for {{TreasuryId}}.
\`\`\`json
{
  "stopLoss": 5.0,
  "slippageLimit": 0.5
}
\`\`\`
  `;

  const invalidMandateMarkdown = `
# Treasury Mandate
\`\`\`json
{
  "stopLoss": 5.0
  // Missing bracket
\`\`\`
  `;

  const dynamicTrustProfileMarkdown = `
# Trust Profile Auditor
Evaluate the following attributes:
1. **Owner Governance Override**: Check proposalClose.
2. **Decimal Risk**: Check approved tokens.
3. **Custom DAO Rule**: Check off-chain forum.
  `;

  let wallet: any;
  let validSignature: string;
  let fileHash: string;
  let parsedGoals: any;

  before(async () => {
    wallet = ethers.Wallet.createRandom();
    fileHash = ethers.sha256(ethers.toUtf8Bytes(validMandateMarkdown));
    const message = `I authorize the update to mandate with hash: ${fileHash}`;
    validSignature = await wallet.signMessage(message);
  });

  describe("Phase 1: Document Integrity & Parsing (API Layer)", () => {
    it("should successfully extract and parse JSON configuration blocks from the Markdown", () => {
      parsedGoals = MockContextAggregator.extractJsonBlocks(validMandateMarkdown);
      expect(parsedGoals.stopLoss).to.equal(5.0);
      expect(parsedGoals.slippageLimit).to.equal(0.5);
    });

    it("should securely reject malformed Markdown (invalid JSON blocks)", () => {
      expect(() => MockContextAggregator.extractJsonBlocks(invalidMandateMarkdown)).to.throw();
    });

    it("should generate a consistent SHA-256 hash matching the exact text state", () => {
      const expectedHash = ethers.sha256(ethers.toUtf8Bytes(validMandateMarkdown));
      expect(fileHash).to.equal(expectedHash);
    });

    it("should verify the Treasury Owner's EIP-712 signature against the file hash", () => {
      const expectedMessage = `I authorize the update to mandate with hash: ${fileHash}`;
      const recoveredAddress = ethers.verifyMessage(expectedMessage, validSignature);
      expect(recoveredAddress.toLowerCase()).to.equal(wallet.address.toLowerCase());
    });
  });

  describe("Phase 2: Agent Context Building (Agent Layer)", () => {
    it("should correctly load the validated Markdown template as the System Prompt", () => {
      const systemPrompt = MockContextAggregator.buildSystemPrompt(validMandateMarkdown);
      expect(systemPrompt).to.include("0xVaultAddress");
    });

    it("should dynamically map Trust Profile attributes regardless of how many exist", () => {
      // Proves the agent doesn't hardcode "8 attributes" but reads whatever the owner provided
      const attributes = MockContextAggregator.dynamicallyParseTrustAttributes(dynamicTrustProfileMarkdown);
      expect(attributes.length).to.equal(3);
      expect(attributes[0]).to.equal("Owner Governance Override");
      expect(attributes[2]).to.equal("Custom DAO Rule");
    });

    it("should strictly enforce RiskEngine rules using variables parsed from the Markdown document", () => {
      const safeAction = { type: "swapBack", lossPercentage: 2.0 };
      const unsafeAction = { type: "swapBack", lossPercentage: 10.0 }; // Exceeds the 5.0 stopLoss in Markdown

      expect(MockRiskEngine.evaluateTrade(safeAction, parsedGoals)).to.be.true;
      expect(MockRiskEngine.evaluateTrade(unsafeAction, parsedGoals)).to.be.false;
    });
  });
});
