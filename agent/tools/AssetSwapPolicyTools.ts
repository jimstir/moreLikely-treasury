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
        tokenOut: string,
        amountIn?: string,
        minAmountOut?: string,
        deadline?: string,
        swapCallData?: string
    ): TransactionPayload {
        return {
            targetContract: policyAddress,
            functionSignature: "executeSwap(uint256,address,address,uint256,uint256,uint256,bytes)",
            abiParameters: [
                proposalId,
                tokenIn,
                tokenOut,
                amountIn || "0",
                minAmountOut || "0",
                deadline || "0",
                swapCallData || "0x"
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
