import { GoogleGenerativeAI } from '@google/generative-ai';
import { ILLMProvider, InferenceResult } from '../interfaces';

export class GeminiAdapter implements ILLMProvider {
    private client: GoogleGenerativeAI;
    private modelName: string;

    constructor(apiKey: string, modelName: string = "gemini-1.5-pro") {
        if (!apiKey) {
            console.warn("[Gemini] API key is missing. Ensure GEMINI_API_KEY is set in .env.");
        }
        this.client = new GoogleGenerativeAI(apiKey);
        this.modelName = modelName;
    }

    public async requestInference(prompt: string | any[]): Promise<InferenceResult> {
        console.log(`[Gemini] Sending inference to ${this.modelName}...`);
        
        try {
            const model = this.client.getGenerativeModel({ model: this.modelName });
            
            // Format prompt
            let promptText = "";
            if (typeof prompt === "string") {
                promptText = prompt;
            } else {
                promptText = prompt.map(m => `${m.role}: ${m.content}`).join("\n");
            }
            
            // Define tools (Functions)
            const tools = [{
                functionDeclarations: [
                    {
                        name: "get_market_data",
                        description: "Fetches live market price and liquidity for a token",
                        parameters: {
                            type: "OBJECT" as any,
                            properties: {
                                token: { type: "STRING" as any }
                            },
                            required: ["token"]
                        }
                    }
                ]
            }];

            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: promptText }] }],
                tools: tools
            });

            const response = result.response;
            const textResponse = response.text() || "";
            
            // Parse tool calls if any
            const toolCalls: any[] = [];
            const functionCalls = response.functionCalls();
            
            if (functionCalls && functionCalls.length > 0) {
                for (const fc of functionCalls) {
                    toolCalls.push({
                        toolName: fc.name,
                        parameters: fc.args
                    });
                }
            }

            return {
                textResponse,
                toolCalls
            };
        } catch (error) {
            console.error(`[Gemini] Inference failed:`, error);
            throw error;
        }
    }

    public async getBillingStatus(): Promise<{ balance: string; unit: string }> {
        return { balance: "Active Subscription", unit: "Gemini Tier" };
    }
}
