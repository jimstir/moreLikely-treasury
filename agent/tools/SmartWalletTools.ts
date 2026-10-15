import { ethers } from "ethers";
import { TransactionPayload } from "./TransactionRelayer";

export class SmartWalletTools {
    /**
     * Tool: forward_proposal
     * Forwards proposalOpen through the SmartWallet contract, enforcing rate limits and gas refunds.
     */
    static forwardProposal(
        smartWalletAddress: string,
        vaultAddress: string,
        policyAddress: string,
        tokenIn: string,
        amountInStr: string
    ): TransactionPayload {
        const amountWei = amountInStr ? ethers.parseUnits(amountInStr, 18).toString() : "0";

        return {
            targetContract: smartWalletAddress,
            functionSignature: "forwardProposal(uint256,address,address,uint8,address)",
            abiParameters: [
                amountWei,
                policyAddress,
                vaultAddress,
                "0", // ProposalType.TXNS
                tokenIn || ethers.ZeroAddress
            ]
        };
    }

    /**
     * Tool: forward_execution
     * Forwards an authorized trade or policy interaction through the SmartWallet contract.
     */
    static forwardExecution(
        smartWalletAddress: string,
        targetContract: string,
        proposalId: string | number | bigint,
        data: string
    ): TransactionPayload {
        return {
            targetContract: smartWalletAddress,
            functionSignature: "forwardExecution(address,uint256,bytes)",
            abiParameters: [
                targetContract,
                proposalId.toString(),
                data || "0x"
            ]
        };
    }

    /**
     * Tool: forward_close
     * Forwards proposalClose through the SmartWallet contract.
     */
    static forwardClose(
        smartWalletAddress: string,
        proposalId: string | number | bigint
    ): TransactionPayload {
        return {
            targetContract: smartWalletAddress,
            functionSignature: "forwardClose(uint256)",
            abiParameters: [
                proposalId.toString()
            ]
        };
    }

    /**
     * Helper: wrapSwapExecution
     * Encodes executeSwap parameters into ABI calldata and formats as a forwardExecution payload.
     */
    static wrapSwapExecution(
        smartWalletAddress: string,
        policyAddress: string,
        proposalId: string | number | bigint,
        tokenIn: string,
        tokenOut: string,
        amountIn?: string,
        minAmountOut?: string,
        deadline?: string,
        swapCallData?: string
    ): TransactionPayload {
        const iface = new ethers.Interface([
            "function executeSwap(uint256 proposal, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 deadline, bytes calldata swapCallData)"
        ]);

        const calldata = iface.encodeFunctionData("executeSwap", [
            proposalId.toString(),
            tokenIn,
            tokenOut,
            amountIn || "0",
            minAmountOut || "0",
            deadline || "0",
            swapCallData || "0x"
        ]);

        return this.forwardExecution(
            smartWalletAddress,
            policyAddress,
            proposalId,
            calldata
        );
    }

    /**
     * Helper: wrapSetTokenOracleMarket
     * Encodes setTokenOracleMarket parameters into ABI calldata and formats as a forwardExecution payload.
     */
    static wrapSetTokenOracleMarket(
        smartWalletAddress: string,
        policyAddress: string,
        proposalId: string | number | bigint,
        tokenOut: string
    ): TransactionPayload {
        const iface = new ethers.Interface([
            "function setTokenOracleMarket(uint256 proposal, address tokenOut)"
        ]);

        const calldata = iface.encodeFunctionData("setTokenOracleMarket", [
            proposalId.toString(),
            tokenOut
        ]);

        return this.forwardExecution(
            smartWalletAddress,
            policyAddress,
            proposalId,
            calldata
        );
    }
}
