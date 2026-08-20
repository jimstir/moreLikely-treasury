import { ILLMProvider, InferenceResult } from '../interfaces';

export class PrivateHostAdapter implements ILLMProvider {
    private endpointUrl: string;

    constructor(endpointUrl: string) {
        this.endpointUrl = endpointUrl;
    }

    public async requestInference(prompt: string): Promise<InferenceResult> {
        console.log(`[PrivateHost] Sending inference to self-hosted node at ${this.endpointUrl}...`);
        try {
            const response = await fetch(this.endpointUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt })
            });

            const data = await response.json() as any;
            if (!response.ok) {
                throw new Error(JSON.stringify(data));
            }

            return {
                textResponse: data.textResponse || "",
                toolCalls: data.toolCalls || [],
                receiptSignature: data.signature
            };
        } catch (error) {
            console.error(`[PrivateHost] Self-hosted inference failed:`, error);
            throw error;
        }
    }
}
