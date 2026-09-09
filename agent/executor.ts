import { ethers } from "ethers";
import { PolicyActionRecommendation, TreasuryGoals } from "./interfaces";

export class Executor {
    private circleClient: any;
    private walletId: string | null;

    constructor(circleClient: any = null, walletId: string | null = null) {
        this.circleClient = circleClient;
        this.walletId = walletId;
    }

    // Goal Alignment & Risk Checks
    riskCheck(
        recommendation: PolicyActionRecommendation
    ): { passed: boolean; reason: string } {
        // The Executor is an un-opinionated transaction relayer.
        // Deep risk limits (e.g., maximum token allocations, health factors) are enforced 
        // entirely by the Smart Contracts. The transaction will safely revert on-chain if out of bounds.

        if (!recommendation.recommendAction || recommendation.actionType === "NONE") {
            return { passed: false, reason: "No action recommended by LLM." };
        }

        // Extremely basic structural checks
        if (recommendation.actionType === "ASSET_SWAP") {
            const amount = parseFloat(recommendation.amountIn || "0");
            if (isNaN(amount) || amount <= 0) {
                return { passed: false, reason: "Invalid amount specified for Asset Swap." };
            }
        }

        return { passed: true, reason: "Basic formatting passed. Execution deferred to on-chain smart contract bounds." };
    }

    // Submit Proposal On-Chain (Generates proposal instead of executing trade directly)
    async generateProposal(
        vaultAddress: string,
        policyAddress: string,
        recommendation: PolicyActionRecommendation
    ): Promise<string> {
        const amountWei = recommendation.amountIn ? ethers.parseUnits(recommendation.amountIn, 18) : 0n;

        if (!this.circleClient || !this.walletId) {
            throw new Error("Circle wallet client or wallet ID not configured.");
        }

        console.log("Submitting proposal generation transaction via Circle Developer-Controlled Wallets API...");
        
        // Proposal Generation: Instead of executing a trade directly, it formats the request into an openProposal transaction.
        // The True Safeguard: Off-chain risk checked with the trust profile before shareholders vote.
        const response = await this.circleClient.createContractExecutionTransaction({
            walletId: this.walletId,
            contractAddress: vaultAddress,
            abiFunctionSignature: "proposalOpen(uint256,address,address,uint8,address)",
            abiParameters: [
                amountWei.toString(),
                policyAddress,
                vaultAddress,
                "0", // ProposalType.TXNS
                recommendation.tokenIn || ethers.ZeroAddress
            ],
            feeLevel: "MEDIUM"
        });

        const txId = response.data?.id || "unknown";
        console.log(`Proposal Generation submitted! Circle Tx ID: ${txId}.`);
        return txId;
    }
}
