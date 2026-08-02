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

    /**
     * Executes a single decision tick of the AI Governor.
     */
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
                    const toolResult = await this.executeTool(toolCall);
                    
                    conversationHistory.push({
                        role: 'tool',
                        name: toolCall.toolName,
                        content: JSON.stringify(toolResult)
                    });
                }
            } else {
                console.log(`[AgentRunner] AI concluded reasoning: ${llmResponse.textResponse}`);
                hasFinished = true;
            }
        }

        console.log(`[AgentRunner] Tick complete. Saving transcript...`);
        // TODO: Save transcript via logger.ts
    }

    private async executeTool(toolCall: ToolCallRequest): Promise<any> {
        // Implement standard tool mappings here
        switch (toolCall.toolName) {
            case 'read_treasury_state':
                return await this.stateProvider.getTreasuryState();
            case 'get_market_data':
                return await this.stateProvider.getMarketData([toolCall.parameters.token]);
            default:
                return { error: `Tool ${toolCall.toolName} not implemented or unrecognized.` };
        }
    }
}
