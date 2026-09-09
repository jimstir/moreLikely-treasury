import { Indexer, MemData } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AgentLogger {
    private indexerNode: string = "https://rpc-storage-testnet.0g.ai";
    private wallet: ethers.Wallet;

    constructor(privateKey: string) {
        // Initialize an ethers wallet used to sign 0G storage upload transactions
        // and pay the ZG token fee for the storage layer.
        const provider = new ethers.JsonRpcProvider("https://evm-rpc-testnet.0g.ai");
        this.wallet = new ethers.Wallet(privateKey, provider);
    }
    
    public async saveTranscript(invocationId: string, history: any[], use0GStorage: boolean): Promise<string | null> {
        console.log(`[Logger] Processing transcript ${invocationId}...`);
        // We only persist to Prisma when a Proposal is actually created (via linkDecisionReport)

        if (use0GStorage) {
            console.log(`[Logger] Persisting transcript ${invocationId} to 0G Storage Network...`);
            try {
                const receiptHash = await this.uploadTo0G(history);
                console.log(`[Logger] Successfully secured transcript on 0G Storage! Hash: ${receiptHash}`);
                return receiptHash;
            } catch (error) {
                console.error(`[Logger] Failed to secure transcript on 0G Storage. Proceeding with local copy only.`);
                return null;
            }
        }
        return null;
    }

    public async linkDecisionReport(
        proposalId: string, 
        rationale: string, 
        timeframe: string, 
        swapRoutes: any, 
        rawMarketData: any, 
        ticketReceipt?: string
    ): Promise<void> {
        console.log(`[Logger] Saving DecisionReport for proposal ${proposalId}...`);
        try {
            await prisma.decisionReport.create({
                data: {
                    proposalId,
                    rationale,
                    timeframe,
                    swapRoutes,
                    rawMarketData,
                    ticketReceipt
                }
            });
            console.log(`[Logger] Successfully saved DecisionReport to database.`);
        } catch (error) {
            console.error(`[Logger] Failed to save DecisionReport to database:`, error);
        }
    }

    private async uploadTo0G(data: any): Promise<string> {
        try {
            // Instantiate the 0G storage indexer client
            const indexer = new Indexer(this.indexerNode);
            // Serialize our transcript data
            const dataString = JSON.stringify(data);
            const dataBuffer = Buffer.from(dataString, 'utf-8');
            
            // Convert to a blob/file format accepted by the SDK
            const file = new MemData(dataBuffer);

            console.log(`[Logger] Chunking and uploading file to 0G Storage Nodes...`);
            
            // This uploads the data to the decentralized network and charges the ZG token fee
            const [res, err] = await indexer.upload(
                file,
                "https://evm-rpc-testnet.0g.ai",
                this.wallet
            );
            
            if (err) throw err;

            // Depending on the exact version of the SDK, it may return a single hash or an array
            return "rootHash" in res ? res.rootHash : res.rootHashes[0];
        } catch (error) {
            console.error(`[Logger] 0G Storage Upload Error:`, error);
            throw error;
        }
    }
}
