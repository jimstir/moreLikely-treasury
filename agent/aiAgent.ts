import { ethers } from "ethers";
import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import { IAIAgent, ILLMProvider, TreasuryState, MarketData, TreasuryGoals, TradeRecommendation } from './interfaces';

export { TreasuryGoals, TradeRecommendation, TreasuryState };

export class AIOwnerAgent implements IAIAgent {
    private provider: ethers.Provider;
    private circleClient?: ReturnType<typeof initiateDeveloperControlledWalletsClient>;
    private walletId?: string;
    private agentWallet?: ethers.Wallet;
    
    public llmProvider?: ILLMProvider;
    public vaultAddress: string;
    public policyAddress: string;
    public model: string;

    private zeroGComputeApiKey?: string;
    private zeroGComputeBaseUrl?: string;

    constructor(
        rpcUrlOrProvider: string | ethers.Provider,
        circleApiKeyOrPrivateKey: string,
        circleEntitySecretOrApiKey?: string,
        walletId?: string,
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

        // Support both Circle Developer-Controlled Wallets and direct EOA signing (for testing)
        if (circleApiKeyOrPrivateKey.startsWith("0x")) {
            this.agentWallet = new ethers.Wallet(circleApiKeyOrPrivateKey, this.provider);
            // Shift parameters for local EOA mode compatibility in tests
            this.zeroGComputeApiKey = circleEntitySecretOrApiKey;
            this.zeroGComputeBaseUrl = walletId;
            this.model = zeroGComputeApiKey || "glm-5.2";
            this.vaultAddress = "";
            this.policyAddress = "";
        } else {
            this.circleClient = initiateDeveloperControlledWalletsClient({
                apiKey: circleApiKeyOrPrivateKey,
                entitySecret: circleEntitySecretOrApiKey || "",
            });
            this.walletId = walletId;
            this.zeroGComputeApiKey = zeroGComputeApiKey;
            this.zeroGComputeBaseUrl = zeroGComputeBaseUrl;
            this.vaultAddress = "";
            this.policyAddress = "";
        }
    }

    // IAIAgent interface: monitorState
    async monitorState(vaultAddress: string): Promise<TreasuryState> {
        return this.monitorCurrentState(vaultAddress);
    }

    // IAIAgent interface: evaluate
    async evaluate(state: TreasuryState, marketData: MarketData): Promise<TradeRecommendation> {
        return this.evaluateTrade(state, marketData);
    }

    // IAIAgent interface: execute
    async execute(recommendation: TradeRecommendation): Promise<string> {
        if (!this.vaultAddress || !this.policyAddress) {
            throw new Error("Vault address and policy address must be configured on the agent to execute.");
        }
        return this.proposeTrade(this.vaultAddress, this.policyAddress, recommendation);
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

    // 2. Consult LLM Provider or 0G Compute Network for Trade Recommendation
    async evaluateTrade(
        state: TreasuryState,
        marketData: MarketData
    ): Promise<TradeRecommendation> {
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

        if (this.llmProvider) {
            try {
                const result = await this.llmProvider.requestInference(prompt);
                const content = result.textResponse;
                const match = content.match(/\{[\s\S]*\}/);
                if (match) {
                    return JSON.parse(match[0]) as TradeRecommendation;
                }
                throw new Error("Invalid response format from LLM Provider");
            } catch (error) {
                console.error("LLM Provider inference failed, falling back:", error);
            }
        }

        if (!this.zeroGComputeApiKey || !this.zeroGComputeBaseUrl) {
            return {
                recommendTrade: false,
                tokenIn: "",
                tokenOut: "",
                amountIn: "0",
                rationale: "LLM Provider and 0G Compute Client not initialized."
            };
        }

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
            console.error("0G Compute inference failed:", error);
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

    // 4. Submit Proposal On-Chain (supports both EOA and Circle SDK)
    async proposeTrade(
        vaultAddress: string,
        policyAddress: string,
        trade: TradeRecommendation
    ): Promise<string> {
        const amountWei = ethers.parseUnits(trade.amountIn, 18);

        if (this.agentWallet) {
            // EOA Direct Transaction Flow (for testing)
            const vaultAbi = [
                "function proposalOpen(uint256 amount, address receiver, address owner, uint8 request, address token) external returns (uint256)"
            ];
            const vault = new ethers.Contract(vaultAddress, vaultAbi, this.agentWallet);
            const tx = await vault.proposalOpen(
                amountWei,
                policyAddress,
                this.agentWallet.address,
                0, // ProposalType.TXNS
                trade.tokenIn
            );
            const receipt = await tx.wait();
            return receipt.hash;
        }

        if (!this.circleClient || !this.walletId) {
            throw new Error("Circle wallet client or wallet ID not configured.");
        }

        console.log("Submitting transaction via Circle Developer-Controlled Wallets API...");
        const response = await this.circleClient.createContractExecutionTransaction({
            walletId: this.walletId,
            contractAddress: vaultAddress,
            abiFunctionSignature: "proposalOpen(uint256,address,address,uint8,address)",
            abiParameters: [
                amountWei.toString(),
                policyAddress,
                vaultAddress,
                "0", // ProposalType.TXNS
                trade.tokenIn
            ],
            feeLevel: "MEDIUM"
        });

        const txId = response.data?.id || "unknown";
        console.log(`Transaction submitted! Circle Tx ID: ${txId}. Going to sleep.`);
        console.log(`Waiting for Webhook ping at /webhooks/circle to resume execution.`);
        return txId;
    }
}
