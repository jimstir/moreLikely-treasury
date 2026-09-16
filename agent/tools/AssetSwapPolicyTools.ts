import { TransactionPayload } from "./TransactionRelayer";

export class AssetSwapPolicyTools {
    
    /**
     * Tool: execute_swap
     * Executes the token swap on Uniswap via the Policy contract.
     */
    static executeSwap(
        policyAddress: string,
        proposalId: string,
        tokenIn: string,
        tokenOut: string
    ): TransactionPayload {
        return {
            targetContract: policyAddress,
            functionSignature: "executeSwap(uint256,address,address)",
            abiParameters: [
                proposalId,
                tokenIn,
                tokenOut
            ]
        };
    }

    /**
     * Tool: set_token_oracle_market
     * Registers a token to the active proposal prior to trading it.
     */
    static setTokenOracleMarket(
        policyAddress: string,
        proposalId: string,
        tokenOut: string
    ): TransactionPayload {
        return {
            targetContract: policyAddress,
            functionSignature: "setTokenOracleMarket(uint256,address)",
            abiParameters: [
                proposalId,
                tokenOut
            ]
        };
    }
}
