import { PolicyActionRecommendation, MarketData } from "./interfaces";
import { ILLMProvider } from "./adapters/ILLMProvider";

export class ReasoningEngine {
    private llmProvider: ILLMProvider;

    constructor(llmProvider: ILLMProvider) {
        this.llmProvider = llmProvider;
    }

    async evaluateTrade(contextPayload: any, marketData: MarketData): Promise<PolicyActionRecommendation> {
        const prompt = `
You are the AI Operator for a Tokenized Smart Treasury.
Historical Memory Context:
${JSON.stringify(contextPayload.agentMemory, null, 2)}

Active Policy Rules & Overrides:
${JSON.stringify(contextPayload.policyRules, null, 2)}

Current Treasury Balances:
${JSON.stringify(contextPayload.onChainState.balances, null, 2)}

Current Market Prices:
${JSON.stringify(marketData.prices, null, 2)}

Evaluate if we should execute an action based on your active policies.
Respond ONLY with a valid JSON object matching this schema:
{
  "recommendAction": boolean,
  "actionType": "ASSET_SWAP" | "LENDING" | "NONE",
  "tokenIn": "string (address, optional)",
  "tokenOut": "string (address, optional)",
  "amountIn": "string (amount, optional)",
  "targetPool": "string (address, optional)",
  "rationale": "string explanation"
}
`;

        try {
            const result = await this.llmProvider.requestInference(prompt);
            const content = result.textResponse;
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]) as PolicyActionRecommendation;
            }
            throw new Error("Invalid response format from LLM Provider");
        } catch (error) {
            console.error("Reasoning Engine inference failed:", error);
            return {
                recommendAction: false,
                actionType: "NONE",
                rationale: "Inference failed: " + (error as Error).message
            };
        }
    }
}
