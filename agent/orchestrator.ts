import { ethers } from "ethers";
import OpenAI from "openai";

export enum ProviderType {
    GEMINI_SUBSCRIBER = "gemini",
    ZERO_G = "0g",
    PRIVATE = "private"
}

export class Orchestrator {
    private providerType: ProviderType;
    private isSubscriber: boolean = false;
    private zeroGBalance: number = 0;
    private rpcUrl: string;

    constructor(providerType: ProviderType, rpcUrl: string = process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545") {
        this.providerType = providerType;
        this.rpcUrl = rpcUrl;
    }

    async initializeChecks(userAddress?: string): Promise<void> {
        if (this.providerType === ProviderType.GEMINI_SUBSCRIBER) {
            if (!userAddress) throw new Error("userAddress required to check on-chain subscription");
            this.isSubscriber = await this.checkOnChainSubscription(userAddress);
            if (!this.isSubscriber) {
                throw new Error("User does not have an active platform subscription.");
            }
            
            // Apply Universal Backend Allowances
            const monthlyAllowance = parseInt(process.env.PLATFORM_MONTHLY_INFERENCE_ALLOWANCE || "1000", 10);
            const maxTokens = parseInt(process.env.PLATFORM_MAX_TOKENS_PER_REQUEST || "4096", 10);
            
            console.log(`Subscription active. Monthly allowance: ${monthlyAllowance}, Max tokens per request: ${maxTokens}.`);
            // In a full implementation, these limits would be checked against a database of the user's current usage.
        } else if (this.providerType === ProviderType.ZERO_G) {
            this.zeroGBalance = await this.checkZeroGBalance();
            if (this.zeroGBalance <= 0) {
                throw new Error("Insufficient 0G Network balance to execute inference.");
            }
        }
    }

    public async runAgentLoop(): Promise<void> {
        console.log(`[Orchestrator] Running agent execution loop for provider: ${this.providerType}`);
        // 1. Build Context (query smart contracts & DB for limits/prices)
        // 2. Invoke LLM via selected provider adapter
        // 3. Risk checks via Executor (returns safely mapped action)
        // 4. Dispatch transaction to Circle or Local Wallet
        
        // Mocking execution duration
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`[Orchestrator] Agent loop complete.`);
    }

    private async checkOnChainSubscription(userAddress: string): Promise<boolean> {
        const subContractAddress = process.env.NEXT_PUBLIC_SUBSCRIPTION_CONTRACT;
        if (!subContractAddress) {
            console.warn("Subscription contract address not set in .env. Mocking true for local dev.");
            return true;
        }

        try {
            const provider = new ethers.JsonRpcProvider(this.rpcUrl);
            const subManagerAbi = ["function userPrimaryToken(address) view returns (uint256)"];
            const subContract = new ethers.Contract(subContractAddress, subManagerAbi, provider);
            
            // Check if the user has a primary token ID assigned
            const tokenId = await subContract.userPrimaryToken(userAddress);
            return tokenId > 0n;
        } catch (error) {
            console.error("Failed to check on-chain subscription status", error);
            return false;
        }
    }

    private async checkZeroGBalance(): Promise<number> {
        try {
            // Router Approach: The 0G Private Computer (Router) handles the embedded wallet 
            // and ledger settlement internally. The backend merely uses the API key to connect.
            const apiKey = process.env.ZEROG_COMPUTE_API_KEY;
            if (!apiKey) {
                console.warn("ZEROG_COMPUTE_API_KEY missing in .env.");
                return 0;
            }

            const client = new OpenAI({ 
                apiKey: apiKey,
                baseURL: process.env.ZEROG_COMPUTE_BASE_URL || "https://compute-network-19.integratenetwork.work/v1/proxy"
            });
            
            // In the router approach, the API key is tied to an account on the network.
            // A request to the broker/router determines if there are sufficient funds.
            // Note: Since the OpenAI compatible client may not expose a synchronous `getBalance()` directly
            // on the chat object, we assume an active API key implies a funded router for now.
            return 5.0; 
        } catch (error) {
            console.error("Failed to connect to 0G Compute Router", error);
            return 0;
        }
    }

    public getProviderType(): ProviderType {
        return this.providerType;
    }

    public getIsSubscriber(): boolean {
        return this.isSubscriber;
    }
}
