import OpenAI from "openai";
import { ILLMProvider, InferenceResult } from '../interfaces';

export class PrivateHostAdapter implements ILLMProvider {
    private client: OpenAI;
    private model: string;

    constructor(endpointUrl: string, apiKey: string = "local", model: string = "local-model") {
        if (!endpointUrl) {
            console.warn("[PrivateHost] Endpoint URL is missing. Ensure PRIVATE_BASE_URL is set in .env.");
        }
        this.client = new OpenAI({ 
            apiKey: apiKey,
            baseURL: endpointUrl
        });
        this.model = model;
    }

    public async requestInference(prompt: string | any[]): Promise<InferenceResult> {
        console.log(`[PrivateHost] Sending inference to self-hosted node at ${this.client.baseURL}...`);
        
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
                                properties: { token: { type: "string" } },
                                required: ["token"]
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
            console.error(`[PrivateHost] Self-hosted inference failed:`, error);
            throw error;
        }
    }

    public async getBillingStatus(): Promise<{ balance: string; unit: string }> {
        return { balance: "Self-Hosted", unit: "Local Compute" };
    }
}
