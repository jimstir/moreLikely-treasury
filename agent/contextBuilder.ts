import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from '@prisma/client';
import { Orchestrator } from "./orchestrator";
import { TreasuryState, MarketData } from "./interfaces";

const prisma = new PrismaClient();

export interface BuiltContext {
    onChainState: TreasuryState;
    policyRules: Record<string, any>;
    agentMemory: any[];
    memorySummary: string;
    enabledTasks: Record<string, boolean>;
    customSkill?: string;
    safeMode: boolean;
    safeModeReason?: string;
}

export class ContextBuilder {
    private orchestrator: Orchestrator;
    private provider: ethers.JsonRpcProvider;

    constructor(orchestrator: Orchestrator, rpcUrl: string) {
        this.orchestrator = orchestrator;
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    async buildContext(vaultAddress: string): Promise<BuiltContext> {
        let safeMode = false;
        let safeModeReason: string | undefined;

        // 1. Fetch on-chain state with circuit-breaker fail-safe
        let state: TreasuryState = { assets: [], balances: {} };
        try {
            state = await this.monitorCurrentState(vaultAddress);
            if (!state.assets || state.assets.length === 0) {
                safeMode = true;
                safeModeReason = "Circuit breaker triggered: No on-chain assets or balances could be verified.";
            }
        } catch (e: any) {
            safeMode = true;
            safeModeReason = `Circuit breaker triggered: RPC connection or contract query failed: ${e.message}`;
            state = { assets: [], balances: {} };
        }

        // 2. Fetch Treasury Configuration & Goals from DB
        let enabledTasks: Record<string, boolean> = {
            stopLoss: true,
            rebalancing: true,
            lending: true
        };
        let customSkill: string | undefined;

        if (process.env.DATABASE_URL) {
            try {
                const treasury = await prisma.treasury.findUnique({
                    where: { address: vaultAddress },
                    include: { goals: true }
                });

                if (treasury?.goals?.enabledTasks) {
                    enabledTasks = treasury.goals.enabledTasks as Record<string, boolean>;
                }
                if (treasury?.customSkillMd && treasury.customSkillMd.trim().length > 0) {
                    customSkill = treasury.customSkillMd;
                }
            } catch (e) {
                console.warn("[ContextBuilder] Could not query database for treasury config, using defaults.", e);
            }
        }

        // 3. Load Policy Standards dynamically filtered by deployer-enabled tasks
        let policyRules = this.loadPolicyStandards(enabledTasks, customSkill);

        // 4. Apply Private Overrides if the user is a Platform Subscriber
        if (this.orchestrator.getIsSubscriber()) {
            const privateOverrides = await this.loadPrivateOverrides(vaultAddress);
            policyRules = { ...policyRules, ...privateOverrides };
            console.log("Applied private overrides for subscriber.");
        }

        // 5. Fetch Agent Memory and compile a chronological 5-report summary
        const agentMemory = await this.loadAgentMemory(vaultAddress);
        const memorySummary = this.summarizeAgentMemory(agentMemory);

        return {
            onChainState: state,
            policyRules,
            agentMemory,
            memorySummary,
            enabledTasks,
            customSkill,
            safeMode,
            safeModeReason
        };
    }

    private async monitorCurrentState(vaultAddress: string): Promise<TreasuryState> {
        const vaultAbi = [
            "function asset() external view returns (address)",
            "function approvedTokens(address) external view returns (bool)"
        ];
        const vault = new ethers.Contract(vaultAddress, vaultAbi, this.provider);
        
        const underlyingAsset = await vault.asset();
        if (!underlyingAsset || underlyingAsset === ethers.ZeroAddress) {
            throw new Error("Invalid underlying asset returned from vault.");
        }

        const assets = [underlyingAsset];
        const balances: { [token: string]: string } = {};

        const erc20Abi = ["function balanceOf(address) external view returns (uint256)"];
        const underlyingContract = new ethers.Contract(underlyingAsset, erc20Abi, this.provider);
        const bal = await underlyingContract.balanceOf(vaultAddress);
        balances[underlyingAsset] = ethers.formatEther(bal);

        return { assets, balances };
    }

    private loadPolicyStandards(enabledTasks: Record<string, boolean>, customSkill?: string): Record<string, any> {
        const basePath = path.join(process.cwd(), "docs", "ai agent", "policies");
        let assetSwap = "";
        let lending = "";

        try {
            if (enabledTasks.rebalancing !== false || enabledTasks.stopLoss !== false) {
                assetSwap = fs.readFileSync(path.join(basePath, "asset-swap-rules.md"), "utf8");
                if (enabledTasks.stopLoss === false) {
                    assetSwap += "\n\n[DEPLOYER OVERRIDE]: Stop-loss policy is explicitly DISABLED by deployer.";
                }
            }
            if (enabledTasks.lending !== false) {
                lending = fs.readFileSync(path.join(basePath, "lending-rules.md"), "utf8");
            }
        } catch (e) {
            console.error("Failed to read public policy standards", e);
        }

        const rules: Record<string, any> = {
            assetSwap,
            lending
        };

        if (customSkill) {
            rules.customSkill = customSkill;
        }

        return rules;
    }

    private async loadPrivateOverrides(vaultAddress: string): Promise<any> {
        if (!process.env.DATABASE_URL) return {};
        try {
            const doc = await prisma.treasuryDocument.findFirst({
                where: {
                    treasury: { address: vaultAddress },
                    isPrivateOverride: true
                }
            });
            return doc ? { privatePolicy: doc.fileUri } : {};
        } catch (e) {
            console.error("Failed to load private overrides from DB", e);
            return {};
        }
    }

    private async loadAgentMemory(vaultAddress: string): Promise<any[]> {
        if (!process.env.DATABASE_URL) return [];
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

    private summarizeAgentMemory(reports: any[]): string {
        if (!reports || reports.length === 0) {
            return "No previous proposal decision reports found. Agent is executing initial evaluation cycle.";
        }

        return reports.map((r, i) => {
            const num = i + 1;
            const rationale = r.rationale || "No rationale recorded";
            const timeframe = r.timeframe || "unspecified";
            const dateStr = r.createdAt ? new Date(r.createdAt).toISOString() : "unknown date";
            return `[Historical Decision #${num} - ${dateStr}] Timeframe: ${timeframe} | Rationale: ${rationale}`;
        }).join("\n");
    }
}
