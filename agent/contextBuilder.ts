import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from '@prisma/client';
import { Orchestrator } from "./orchestrator";
import { TreasuryState, MarketData } from "./interfaces";

const prisma = new PrismaClient();

export class ContextBuilder {
    private orchestrator: Orchestrator;
    private provider: ethers.JsonRpcProvider;

    constructor(orchestrator: Orchestrator, rpcUrl: string) {
        this.orchestrator = orchestrator;
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    async buildContext(vaultAddress: string): Promise<any> {
        // 1. Fetch on-chain state to ensure tasks align with on-chain realities
        const state = await this.monitorCurrentState(vaultAddress);
        
        // 2. Load the base Public Standards (RFC-style policy documents)
        let policyRules = this.loadPublicPolicyStandards();

        // 3. Apply Private Overrides if the user is a Platform Subscriber
        if (this.orchestrator.getIsSubscriber()) {
            const privateOverrides = await this.loadPrivateOverrides(vaultAddress);
            policyRules = { ...policyRules, ...privateOverrides };
            console.log("Applied private overrides for subscriber.");
        }

        // 4. Fetch Agent Memory (Historical context)
        const agentMemory = await this.loadAgentMemory(vaultAddress);

        return {
            onChainState: state,
            policyRules: policyRules,
            agentMemory: agentMemory
        };
    }

    private async monitorCurrentState(vaultAddress: string): Promise<TreasuryState> {
        const vaultAbi = [
            "function asset() external view returns (address)",
            "function approvedTokens(address) external view returns (bool)"
        ];
        const vault = new ethers.Contract(vaultAddress, vaultAbi, this.provider);
        
        try {
            const underlyingAsset = await vault.asset();
            const assets = [underlyingAsset];
            const balances: { [token: string]: string } = {};

            const erc20Abi = ["function balanceOf(address) external view returns (uint256)"];
            const underlyingContract = new ethers.Contract(underlyingAsset, erc20Abi, this.provider);
            const bal = await underlyingContract.balanceOf(vaultAddress);
            balances[underlyingAsset] = ethers.formatEther(bal);

            return { assets, balances };
        } catch (e) {
            console.error("Failed to fetch vault state", e);
            return { assets: [], balances: {} };
        }
    }

    private loadPublicPolicyStandards(): any {
        const basePath = path.join(process.cwd(), "docs", "ai agent", "policies");
        let assetSwap = "";
        let lending = "";
        try {
            assetSwap = fs.readFileSync(path.join(basePath, "asset-swap-rules.md"), "utf8");
            lending = fs.readFileSync(path.join(basePath, "lending-rules.md"), "utf8");
        } catch (e) {
            console.error("Failed to read public policy standards", e);
        }

        return {
            assetSwap,
            lending
        };
    }

    private async loadPrivateOverrides(vaultAddress: string): Promise<any> {
        try {
            const treasury = await prisma.treasury.findUnique({
                where: { address: vaultAddress },
                include: { goals: true }
            });
            return treasury?.goals?.privateOverrides || {};
        } catch (e) {
            console.error("Failed to load private overrides from DB", e);
            return {};
        }
    }

    private async loadAgentMemory(vaultAddress: string): Promise<any[]> {
        try {
            // Fetch the last 5 executed proposals/reports for this treasury
            const reports = await prisma.decisionReport.findMany({
                where: { proposal: { treasury: { address: vaultAddress } } },
                orderBy: { createdAt: 'desc' },
                take: 5
            });
            return reports;
        } catch (e) {
            console.error("Failed to fetch agent memory from DB", e);
            return [];
        }
    }
}
