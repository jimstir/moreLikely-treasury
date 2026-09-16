import { ethers } from "ethers";
import { ILLMProvider, IStateProvider, ITradeExecutor, ToolCallRequest } from './interfaces';
import fs from 'fs';
import path from 'path';
import { TransactionRelayer, TransactionPayload } from './tools/TransactionRelayer';
import { TreasuryVaultTools } from './tools/TreasuryVaultTools';
import { AssetSwapPolicyTools } from './tools/AssetSwapPolicyTools';

export class AgentRunner {
    private llmProvider: ILLMProvider;
    private stateProvider: IStateProvider;
    private tradeExecutor: ITradeExecutor;
    private agentWalletAddress: string;

    constructor(
        llmProvider: ILLMProvider,
        stateProvider: IStateProvider,
        tradeExecutor: ITradeExecutor,
        agentWalletAddress: string
    ) {
        this.llmProvider = llmProvider;
        this.stateProvider = stateProvider;
        this.tradeExecutor = tradeExecutor;
        this.agentWalletAddress = agentWalletAddress;
    }

    public async runTick(): Promise<void> {
        console.log(`[AgentRunner] Starting tick for agent wallet: ${this.agentWalletAddress}`);
        
        // 1. Fetch deep on-chain state
        const state = await this.stateProvider.getTreasuryState();
        const goals = await this.stateProvider.getTreasuryGoals();
        
        // Assuming the state provider has been upgraded to fetch active proposals
        const activeProposals = (this.stateProvider as any).getActiveProposals ? await (this.stateProvider as any).getActiveProposals() : [];
        const marketData = await this.stateProvider.getMarketData(state.assets);
        
        // 2. Dynamically load the markdown prompt
        const promptPath = path.join(process.cwd(), 'agent', 'prompts', 'treasury-management-prompt.md');
        let systemPrompt = "";
        try {
            systemPrompt = fs.readFileSync(promptPath, 'utf8');
        } catch (e) {
            console.error("[AgentRunner] Could not load markdown prompt, falling back to basic prompt.", e);
            systemPrompt = `You are an AI Governor. Goals: ${JSON.stringify(goals)}`;
        }

        // 3. Inject context into the prompt
        systemPrompt = systemPrompt
            .replace('{{TreasuryMandate}}', JSON.stringify(goals))
            .replace('{{TreasuryGoals}}', JSON.stringify(goals))
            .replace('{{treasuryId}}', this.agentWalletAddress)
            .replace('{{marketDataJson}}', JSON.stringify(marketData))
            .replace('{{activeProposalsJson}}', JSON.stringify(activeProposals));

        // Inject the explicit chronological lifecycle for the LLM
        const lifecycleInstructions = `
LIFECYCLE RULES (STATLESS RECURRING EXECUTION):
1. Analyze: Read market data and review active proposals.
2. Propose: If a new trade is needed, use propose_trade (proposalOpen) and set_token_oracle_market.
3. Pending Votes: If an existing proposal's state is PENDING, ignore it for this cycle. Do not execute.
4. Execute Votes: If an existing proposal's state is APPROVED, use proposal_approved, then execute_swap.
`;
        systemPrompt += lifecycleInstructions;

        let conversationHistory: any[] = [
            { role: 'system', content: systemPrompt }
        ];

        let hasFinished = false;
        let invocationId = "inv-" + Date.now();
        let logger = new (await import("./logger")).AgentLogger(process.env.AGENT_PRIVATE_KEY || "");
        
        let proposalRationale = "";
        let proposalTimeframe = "";
        let generatedProposalId: string | null = null;

        // 2. Core loop
        while (!hasFinished) {
            console.log(`[AgentRunner] Sending inference request...`);
            const llmResponse = await this.llmProvider.requestInference(conversationHistory);
            
            // Add LLM's response to history
            conversationHistory.push({
                role: 'assistant',
                content: llmResponse.textResponse,
                toolCalls: llmResponse.toolCalls
            });

            if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
                for (const toolCall of llmResponse.toolCalls) {
                    console.log(`[AgentRunner] Executing tool: ${toolCall.toolName}`);
                    try {
                        const toolResult = await this.executeTool(toolCall);
                        
                        if (toolCall.toolName === 'propose_trade' && toolCall.parameters.rationale) {
                            proposalRationale = toolCall.parameters.rationale;
                            proposalTimeframe = toolCall.parameters.timeframe || "1 week";
                        }
                        
                        if (toolResult && toolResult.proposalId) {
                            generatedProposalId = toolResult.proposalId.toString();
                        }
                        
                        conversationHistory.push({
                            role: 'tool',
                            name: toolCall.toolName,
                            content: JSON.stringify(toolResult)
                        });
                    } catch (error: any) {
                        if (error.message.startsWith("FIRE_AND_SLEEP:")) {
                            console.log("[AgentRunner] Gracefully persisting memory to database and terminating process to save compute credits.");
                            hasFinished = true;
                            break; // break out of tool loop
                        } else {
                            throw error;
                        }
                    }
                }
            } else {
                console.log(`[AgentRunner] AI concluded reasoning: ${llmResponse.textResponse}`);
                hasFinished = true;
            }
        }

        console.log(`[AgentRunner] Tick complete. Saving transcript...`);
        const use0G = process.env.USE_0G_STORAGE === 'true';
        const receiptHash = await logger.saveTranscript(invocationId, conversationHistory, use0G);
        
        if (generatedProposalId && proposalRationale) {
            await logger.linkDecisionReport(
                generatedProposalId,
                proposalRationale,
                proposalTimeframe,
                {}, // swapRoutes 
                {}, // rawMarketData
                receiptHash || undefined
            );
        }
    }

    private async executeTool(toolCall: ToolCallRequest): Promise<any> {
        const relayer = new TransactionRelayer(
            (this.tradeExecutor as any).circleClient,
            (this.tradeExecutor as any).walletId
        );
        
        let payload: TransactionPayload | null = null;
        let txHash = "";

        switch (toolCall.toolName) {
            case 'read_treasury_state':
                return await this.stateProvider.getTreasuryState();
            case 'get_market_data':
                return await this.stateProvider.getMarketData([toolCall.parameters.token]);
            
            case 'propose_trade':
                console.log(`[AgentRunner] propose_trade called with params:`, toolCall.parameters);
                payload = TreasuryVaultTools.proposalOpen(
                    toolCall.parameters.vaultAddress || process.env.VAULT_ADDRESS || ethers.ZeroAddress,
                    toolCall.parameters.policyAddress || process.env.POLICY_ADDRESS || ethers.ZeroAddress,
                    toolCall.parameters.tokenIn,
                    toolCall.parameters.amountIn
                );
                txHash = await relayer.executeTransaction(payload);
                return { success: true, txHash };

            case 'proposal_approved':
                console.log(`[AgentRunner] proposal_approved called with params:`, toolCall.parameters);
                payload = TreasuryVaultTools.proposalApproved(
                    toolCall.parameters.vaultAddress || process.env.VAULT_ADDRESS || ethers.ZeroAddress,
                    toolCall.parameters.proposalId
                );
                txHash = await relayer.executeTransaction(payload);
                return { success: true, txHash };

            case 'set_token_oracle_market':
                console.log(`[AgentRunner] set_token_oracle_market called with params:`, toolCall.parameters);
                payload = AssetSwapPolicyTools.setTokenOracleMarket(
                    toolCall.parameters.policyAddress || process.env.POLICY_ADDRESS || ethers.ZeroAddress,
                    toolCall.parameters.proposalId,
                    toolCall.parameters.tokenOut
                );
                txHash = await relayer.executeTransaction(payload);
                return { success: true, txHash };

            case 'execute_swap':
                console.log(`[AgentRunner] execute_swap called with params:`, toolCall.parameters);
                payload = AssetSwapPolicyTools.executeSwap(
                    toolCall.parameters.policyAddress || process.env.POLICY_ADDRESS || ethers.ZeroAddress,
                    toolCall.parameters.proposalId,
                    toolCall.parameters.tokenIn,
                    toolCall.parameters.tokenOut
                );
                txHash = await relayer.executeTransaction(payload);
                
                console.log(`[AgentRunner] 🔥 FIRE AND SLEEP INITIATED 🔥`);
                throw new Error(`FIRE_AND_SLEEP:${txHash}`);
                
            default:
                return { error: `Tool ${toolCall.toolName} not implemented or unrecognized.` };
        }
    }
}
}
