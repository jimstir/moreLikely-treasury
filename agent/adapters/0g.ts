import { ComputeClient } from '@0gfoundation/0g-compute-ts-sdk';

export class ZeroGAdapter {
    private client: ComputeClient;

    constructor(apiKey: string) {
        // Initialize the standard 0G compute SDK client
        this.client = new ComputeClient({ apiKey });
    }

    public async requestInference(messages: any[]): Promise<any> {
        console.log(`[0G] Sending inference to 0G Compute...`);
        try {
            const response = await this.client.chat.completions.create({
                model: "0g-llama-3", // Base model hosted on the decentralized network
                messages: messages,
                // In a production setup, tools schema would be passed into the adapter dynamically
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
            
            // Normalize the 0G SDK response back into our internal interfaces
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
}
