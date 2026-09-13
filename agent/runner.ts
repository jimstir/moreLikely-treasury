import { ILLMProvider, IStateProvider, ITradeExecutor, ToolCallRequest } from './interfaces';

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
        
        // 1. Fetch initial state
        const state = await this.stateProvider.getTreasuryState();
        const goals = await this.stateProvider.getTreasuryGoals();
        
        const systemPrompt = `You are an AI Governor managing an Open Treasury.
        Your goals are: ${JSON.stringify(goals)}
        Current state: ${JSON.stringify(state)}
        Use the provided tools to analyze the market and execute trades.`;

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
        // Implement standard tool mappings here
        switch (toolCall.toolName) {
            case 'read_treasury_state':
                return await this.stateProvider.getTreasuryState();
            case 'get_market_data':
                return await this.stateProvider.getMarketData([toolCall.parameters.token]);
            case 'propose_trade':
                console.log(`[AgentRunner] propose_trade called with params:`, toolCall.parameters);
                // Simulate Circle wallet broadcasting the proposalOpen payload
                const mockProposalId = Math.floor(Math.random() * 1000);
                return { success: true, proposalId: mockProposalId, txHash: "0xMockHash" };
            case 'execute_swap':
                console.log(`[AgentRunner] execute_swap called with params:`, toolCall.parameters);
                const txId = "circle-tx-" + Math.floor(Math.random() * 1000000);
                console.log(`[AgentRunner] Circle API returned TxId: ${txId}`);
                console.log(`[AgentRunner] 🔥 FIRE AND SLEEP INITIATED 🔥`);
                throw new Error(`FIRE_AND_SLEEP:${txId}`);
            default:
                return { error: `Tool ${toolCall.toolName} not implemented or unrecognized.` };
        }
    }
}
