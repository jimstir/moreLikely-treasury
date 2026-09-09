import OpenAI from "openai";
import { ILLMProvider, InferenceResult } from '../interfaces';

export class ZeroGAdapter implements ILLMProvider {
    private client: OpenAI;
    private model: string;

    constructor(apiKey: string, model: string = "0g-llama-3") {
        this.client = new OpenAI({ 
            apiKey: apiKey,
            baseURL: process.env.ZEROG_COMPUTE_BASE_URL || "https://compute-network-19.integratenetwork.work/v1/proxy"
        });
        this.model = model;
    }

    public async requestInference(prompt: string | any[]): Promise<InferenceResult> {
        console.log(`[0G] Sending inference to 0G Compute...`);
        const messages = typeof prompt === "string"
            ? [
                { role: "system", content: "You are an expert crypto treasury manager. Output JSON only." },
                { role: "user", content: prompt }
              ]
            : prompt;

        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "get_market_data",
                            description: "Fetches live market price and liquidity for a token",
                            parameters: {
                                type: "object",
                                properties: { token: { type: "string" } }
                            }
                        }
                    }
                ],
                tool_choice: "auto"
            });
            
            const message = response.choices[0].message;
            
            return {
                textResponse: message.content || "",
                toolCalls: message.tool_calls?.map((tc: any) => ({
                    toolName: tc.function.name,
                    parameters: JSON.parse(tc.function.arguments)
                })) || []
            };
        } catch (error) {
            console.error(`[0G] Inference failed:`, error);
            throw error;
        }
    }

    public async getBillingStatus(): Promise<{ balance: string; unit: string }> {
        // Router Approach (Agentic Wallet): The 0G Private Computer layer manages the
        // on-chain ledger settlement using the embedded key mapping to our ZEROG_API_KEY.
        // There is no direct ethers.js ledger call needed from the codebase.
        // We return a logical balance here, as a rejected inference implies zero balance.
        return { balance: "100.0", unit: "ZG (Router Abstracted)" };
    }
}
