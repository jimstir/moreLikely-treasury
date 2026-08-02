import { ethers } from "ethers";

export interface TokenDecimals {
    [tokenAddress: string]: number;
}

export interface TreasuryState {
    assets: string[];
    balances: { [token: string]: string }; // Note: these are scaled values, need decimals to format
    decimals: TokenDecimals;
    totalShareSupply: string;
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

export interface ProposalVisibility {
    ownerReviewRequired: boolean; // If true, owner must review/approve before stakeholders vote
}

export interface IStateProvider {
    /**
     * Fetches the current on-chain state of the treasury (balances, assets).
     * Must internally query the ERC20 decimals() view function for each asset.
     */
    getTreasuryState(vaultAddress: string): Promise<TreasuryState>;
    
    /**
     * Fetches current market data (Uniswap prices, liquidity).
     */
    getMarketData(assets: string[]): Promise<MarketData>;

    /**
     * Fetches the configured goals and restrictions for the treasury.
     */
    getTreasuryGoals(vaultAddress: string): Promise<TreasuryGoals>;
}

export interface IProposer {
    /**
     * The network chain ID the proposer is currently connected to.
     */
    readonly chainId: number;

    /**
     * Opens a new proposal on the Treasury Vault.
     * Takes into account the Agent Proposal Visibility settings.
     */
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
    /**
     * Gets the encoded calldata from the DEX (e.g. Uniswap Router).
     */
    getQuoteAndCalldata(
        tokenIn: string,
        tokenOut: string,
        amountIn: string,
        slippageTolerance: number
    ): Promise<{ amountOut: string; calldata: string }>;

    /**
     * Generates an ECDSA attestation signature over the voting results and executes the trade.
     */
    executeApprovedTrade(
        policyAddress: string,
        proposalId: number,
        totalVotesFor: string,
        totalVotesAgainst: string,
        swapCalldata: string
    ): Promise<{ success: boolean; txHash?: string }>;
}

export interface ILLMProvider {
    /**
     * Uses the provider (e.g. @0gfoundation/0g-compute-ts-sdk) to get a chat completion based on the treasury context.
     * Must authenticate using the on-chain billing account funded by the owner.
     * 
     * @returns {
     *   response: The LLM's response text (e.g. JSON trade decision)
     *   receiptId: The inference receipt/job ID for auditability (to persist in DecisionReport)
     * }
     */
    getDecision(prompt: string, context: string): Promise<{ response: string; receiptId: string }>;

    /**
     * Calculates the estimated cost of running the agent based on the invocation frequency.
     * @param invocationsPerMonth e.g., 60 for twice a day
     * @param currentDeposit Balance of billing tokens currently deposited
     * @returns A human-readable estimate (e.g. "Based on your schedule, the agent will run 60 times a month. We estimate this will cost ~3 0G Tokens. You are currently depositing 10 0G Tokens, which provides ~3.3 months of runway.")
     */
    calculateCostRunway(invocationsPerMonth: number, currentDeposit: string): string;
}
