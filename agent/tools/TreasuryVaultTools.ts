import { ethers } from "ethers";
import { TransactionPayload } from "./TransactionRelayer";

import { SmartWalletTools } from "./SmartWalletTools";

export class TreasuryVaultTools {
    
    /**
     * Tool: propose_trade
     * Opens a new proposal on the Vault to execute a specific policy action.
     * If smartWalletAddress is provided, routes through SmartWallet.forwardProposal for gas refunding and rate limits.
     */
    static proposalOpen(
        vaultAddress: string,
        policyAddress: string,
        tokenIn: string,
        amountInStr: string,
        smartWalletAddress?: string
    ): TransactionPayload {
        if (smartWalletAddress) {
            return SmartWalletTools.forwardProposal(
                smartWalletAddress,
                vaultAddress,
                policyAddress,
                tokenIn,
                amountInStr
            );
        }

        const amountWei = amountInStr ? ethers.parseUnits(amountInStr, 18).toString() : "0";

        return {
            targetContract: vaultAddress,
            functionSignature: "proposalOpen(uint256,address,address,uint8,address)",
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
     * Tool: proposal_approved
     * Executed by the AI once an off-chain vote concludes successfully, transferring funds to the policy.
     */
    static proposalApproved(
        vaultAddress: string,
        proposalId: string
    ): TransactionPayload {
        return {
            targetContract: vaultAddress,
            functionSignature: "proposalApproved(uint256)",
            abiParameters: [proposalId]
        };
    }
}
