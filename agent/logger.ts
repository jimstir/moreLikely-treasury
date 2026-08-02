import { Indexer, getFlowContract } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';

export class AgentLogger {
    private indexerNode: string = "https://rpc-storage-testnet.0g.ai";
    private wallet: ethers.Wallet;

    constructor(privateKey: string) {
        // Initialize an ethers wallet used to sign 0G storage upload transactions
        // and pay the ZG token fee for the storage layer.
        const provider = new ethers.JsonRpcProvider("https://evm-rpc-testnet.0g.ai");
        this.wallet = new ethers.Wallet(privateKey, provider);
    }
    
    public async saveTranscript(invocationId: string, history: any[], use0GStorage: boolean): Promise<void> {
        console.log(`[Logger] Saving transcript ${invocationId} to local database...`);
        // TODO: Prisma insert to AgentInvocation table

        if (use0GStorage) {
            console.log(`[Logger] Persisting transcript ${invocationId} to 0G Storage Network...`);
            try {
                const receiptHash = await this.uploadTo0G(history);
                console.log(`[Logger] Successfully secured transcript on 0G Storage! Hash: ${receiptHash}`);
                // Save receiptHash back to the Prisma AgentInvocation model
            } catch (error) {
                console.error(`[Logger] Failed to secure transcript on 0G Storage. Proceeding with local copy only.`);
            }
        }
    }

    public async linkDecisionReport(proposalId: string, invocationId: string): Promise<void> {
        console.log(`[Logger] Linking proposal ${proposalId} to invocation ${invocationId} in DecisionReport table...`);
        // TODO: Prisma insert to DecisionReport table
    }

    private async uploadTo0G(data: any): Promise<string> {
        try {
            // Instantiate the 0G storage indexer client
            const indexer = new Indexer(this.indexerNode);
            // Connect to the underlying smart contract flow
            const flowContract = await getFlowContract(this.wallet); 
            
            // Serialize our transcript data
            const dataString = JSON.stringify(data);
            const dataBuffer = Buffer.from(dataString, 'utf-8');
            
            // Convert to a blob/file format accepted by the SDK
            const file = new File([dataBuffer], "transcript.json", { type: "application/json" });

            console.log(`[Logger] Chunking and uploading file to 0G Storage Nodes...`);
            
            // This uploads the data to the decentralized network and charges the ZG token fee
            const result = await indexer.upload(file, {
                tags: [{ name: "Type", value: "AI-Governor-Transcript" }],
                flowContract: flowContract
            });

            return result.dataRoot;
        } catch (error) {
            console.error(`[Logger] 0G Storage Upload Error:`, error);
            throw error;
        }
    }
}
