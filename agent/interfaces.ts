import { ethers } from "ethers";

export interface TokenDecimals {
    [tokenAddress: string]: number;
}

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

export interface PolicyActionRecommendation {
    recommendAction: boolean;
    actionType: "ASSET_SWAP" | "LENDING" | "NONE";
    tokenIn?: string;
    tokenOut?: string;
    amountIn?: string;
    targetPool?: string; // For lending rebalancing
    rationale: string;
}

export interface IAIAgent {
    monitorState(vaultAddress: string): Promise<TreasuryState>;
    evaluate(state: TreasuryState, marketData: MarketData): Promise<PolicyActionRecommendation>;
    execute(recommendation: PolicyActionRecommendation): Promise<string>;
}

export interface InferenceResult {
    textResponse: string;
    toolCalls?: Array<{
        toolName: string;
        parameters: Record<string, any>;
    }>;
    receiptSignature?: string; // Verification proof for ZG/Private receipts
}

export interface ILLMProvider {
    requestInference(prompt: string | any[]): Promise<InferenceResult>;
    getBillingStatus?(): Promise<{ balance: string; unit: string }>;
}

// Legacy helper interfaces for runner.ts compatibility
export interface ProposalVisibility {
    ownerReviewRequired: boolean;
}

export interface ToolCallRequest {
    toolName: string;
    parameters: Record<string, any>;
}

export interface IStateProvider {
    getTreasuryState(vaultAddress?: string): Promise<TreasuryState>;
    getMarketData(assets: string[]): Promise<MarketData>;
    getTreasuryGoals(vaultAddress?: string): Promise<TreasuryGoals>;
}

export interface IProposer {
    readonly chainId: number;
    proposeTrade(
        vaultAddress: string,
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        rationale: string,
        visibility: ProposalVisibility
    ): Promise<{ success: boolean; proposalId?: number; txHash?: string }>;
}

export interface ITradeExecutor {
    getQuoteAndCalldata(
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        slippageTolerance: number
    ): Promise<{ amountOut: string; calldata: string }>;

    executeApprovedTrade(
        policyAddress: string,
        proposalId: number,
        totalVotesFor: string,
        totalVotesAgainst: string,
        swapCalldata: string
    ): Promise<{ success: boolean; txHash?: string }>;
}
