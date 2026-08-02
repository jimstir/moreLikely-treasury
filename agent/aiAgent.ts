import { ethers } from "ethers";
import { ComputeClient } from "@0gfoundation/0g-compute-ts-sdk";
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';

export interface TreasuryState {
    assets: string[];
    balances: { [token: string]: string };
}

export interface MarketData {
    prices: { [token: string]: number };
    liquidity: { [token: string]: string };
}

export interface TreasuryGoals {
    maxTokenAllocationPercent: { [token: string]: number };
    slippageTolerancePercent: number;
    stopLossPercent: { [token: string]: number };
}

export interface TradeRecommendation {
    recommendTrade: boolean;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    rationale: string;
}

export class AIOwnerAgent {
    private provider: ethers.Provider;
    private circleClient: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
    private walletId: string;
    private zeroGComputeApiKey?: string;
    private zeroGComputeBaseUrl?: string;

    public model: string;

    constructor(
        rpcUrlOrProvider: string | ethers.Provider,
        circleApiKey: string,
        circleEntitySecret: string,
        walletId: string,
        zeroGComputeApiKey?: string,
        zeroGComputeBaseUrl?: string,
        model: string = "glm-5.2"
    ) {
        this.model = model;
        if (typeof rpcUrlOrProvider === "string") {
            this.provider = new ethers.JsonRpcProvider(rpcUrlOrProvider);
        } else {
            this.provider = rpcUrlOrProvider;
        }
        
        this.walletId = walletId;
        this.circleClient = initiateDeveloperControlledWalletsClient({
            apiKey: circleApiKey,
            entitySecret: circleEntitySecret,
        });

        this.zeroGComputeApiKey = zeroGComputeApiKey;
        this.zeroGComputeBaseUrl = zeroGComputeBaseUrl;
    }

    // 1. Query current Treasury state from the contract
    async monitorCurrentState(vaultAddress: string): Promise<TreasuryState> {
        const vaultAbi = [
            "function asset() external view returns (address)",
            "function approvedTokens(address) external view returns (bool)"
        ];
        const vault = new ethers.Contract(vaultAddress, vaultAbi, this.provider);
        const underlyingAsset = await vault.asset();

        const assets = [underlyingAsset];
        const balances: { [token: string]: string } = {};

        // Query underlying asset balance
        const erc20Abi = ["function balanceOf(address) external view returns (uint256)"];
        const underlyingContract = new ethers.Contract(underlyingAsset, erc20Abi, this.provider);
        const bal = await underlyingContract.balanceOf(vaultAddress);
        balances[underlyingAsset] = ethers.formatEther(bal);

        return {
            assets,
            balances
        };
    }

    // 2. Consult 0G Compute Network LLM for Trade Recommendation
    async evaluateTrade(
        state: TreasuryState,
        marketData: MarketData
    ): Promise<TradeRecommendation> {
        if (!this.zeroGComputeApiKey || !this.zeroGComputeBaseUrl) {
            return {
                recommendTrade: false,
                tokenIn: "",
                tokenOut: "",
                amountIn: "0",
                rationale: "0G Compute Client not initialized."
            };
        }

        const prompt = `
You are the AI Operator for a Tokenized Smart Treasury.
Current Treasury Balances:
${JSON.stringify(state.balances, null, 2)}

Current Market Prices:
${JSON.stringify(marketData.prices, null, 2)}

Evaluate if we should execute a trade (buy/sell). Rebalance assets to optimize yield and stay safe.
Respond ONLY with a valid JSON object matching this schema:
{
  "recommendTrade": boolean,
  "tokenIn": "string (address)",
  "tokenOut": "string (address)",
  "amountIn": "string (amount in decimal format, e.g. 1.5)",
  "rationale": "string explanation"
}
`;

        try {
            const response = await fetch(`${this.zeroGComputeBaseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.zeroGComputeApiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: "system", content: "You are an expert crypto treasury manager. Output JSON only." },
                        { role: "user", content: prompt }
                    ]
                })
            });

            const data = await response.json() as any;
            if (!response.ok) {
                throw new Error(JSON.stringify(data));
            }

            const content = data.choices[0].message?.content || "";
            const match = content.match(/\{[\s\S]*\}/);
            if (match) {
                return JSON.parse(match[0]) as TradeRecommendation;
            }
            throw new Error("Invalid response format from 0G Compute LLM");
        } catch (error) {
            console.error("0G Compute inference failed, using fallback logic:", error);
            return {
                recommendTrade: false,
                tokenIn: "",
                tokenOut: "",
                amountIn: "0",
                rationale: "Inference failed: " + (error as Error).message
            };
        }
    }

    // 3. Goal Alignment & Risk Checks
    riskCheck(
        recommendation: TradeRecommendation,
        state: TreasuryState,
        goals: TreasuryGoals
    ): { passed: boolean; reason: string } {
        if (!recommendation.recommendTrade) {
            return { passed: false, reason: "No trade recommended by LLM." };
        }

        const amount = parseFloat(recommendation.amountIn);
        if (isNaN(amount) || amount <= 0) {
            return { passed: false, reason: "Invalid amount specified." };
        }

        const tokenIn = recommendation.tokenIn;
        const balanceInStr = state.balances[tokenIn] || "0";
        const balanceIn = parseFloat(balanceInStr);
        if (balanceIn < amount) {
            return { passed: false, reason: `Insufficient balance: vault holds ${balanceInStr}, requested ${recommendation.amountIn}` };
        }

        const maxAllocPercent = goals.maxTokenAllocationPercent[recommendation.tokenOut] || 100;
        if (maxAllocPercent < 50) {
            return { passed: false, reason: `Proposed trade violates maximum allocation limit of ${maxAllocPercent}% for tokenOut.` };
        }

        return { passed: true, reason: "All risk checks passed successfully." };
    }

    // 4. Submit Proposal On-Chain via Circle API (Fire and Sleep)
    async proposeTrade(
        vaultAddress: string,
        policyAddress: string,
        trade: TradeRecommendation
    ): Promise<string> {
        const vaultAbi = [
            "function proposalOpen(uint256 amount, address policy, address receiver, bool select, bool tOrF, address token) external returns (uint256)"
        ];
        
        const iface = new ethers.Interface(vaultAbi);
        const amountWei = ethers.parseUnits(trade.amountIn, 18);
        
        // We will pass the vault address as the receiver since the agent doesn't have a local ethers.Wallet address anymore
        const receiver = vaultAddress; 

        // 1. Encode the contract call
        const calldata = iface.encodeFunctionData("proposalOpen", [
            amountWei,
            policyAddress,
            receiver,
            true,
            false,
            trade.tokenIn
        ]);

        console.log("Submitting transaction via Circle Developer-Controlled Wallets API...");
        
        // 2. Broadcast via Circle SDK
        const response = await this.circleClient.createContractExecutionTransaction({
            walletId: this.walletId,
            contractAddress: vaultAddress,
            abiFunctionSignature: "proposalOpen(uint256,address,address,bool,bool,address)",
            abiParameters: [
                amountWei.toString(),
                policyAddress,
                receiver,
                "true",
                "false",
                trade.tokenIn
            ],
            feeLevel: "MEDIUM"
        });

        const txId = response.data?.id || "unknown";
        console.log(`Transaction submitted! Circle Tx ID: ${txId}. Going to sleep.`);
        console.log(`Waiting for Webhook ping at /webhooks/circle to resume execution.`);
        
        // 3. Fire and Sleep (return txId immediately without awaiting blockchain confirmation)
        return txId;
    }
}

