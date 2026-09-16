import { ethers } from "ethers";

export interface TransactionPayload {
    targetContract: string;
    functionSignature: string;
    abiParameters: any[];
    value?: bigint;
}

export class TransactionRelayer {
    private circleClient: any;
    private walletId: string | null;

    constructor(circleClient: any = null, walletId: string | null = null) {
        this.circleClient = circleClient;
        this.walletId = walletId;
    }

    /**
     * Executes the transaction based on the environment's EXECUTION_MODE.
     * CIRCLE = Broadcasts via Circle API (Platform)
     * LOCAL_ETHERS = Signs & Broadcasts via local private key (Private Deploy)
     */
    async executeTransaction(payload: TransactionPayload): Promise<string> {
        const mode = process.env.EXECUTION_MODE || "CIRCLE";

        if (mode === "LOCAL_ETHERS") {
            return await this.executeViaEthers(payload);
        } else {
            return await this.executeViaCircle(payload);
        }
    }

    private async executeViaCircle(payload: TransactionPayload): Promise<string> {
        if (!this.circleClient || !this.walletId) {
            throw new Error("Circle wallet client or wallet ID not configured. Switch to LOCAL_ETHERS mode if testing privately.");
        }

        console.log(`[Relayer:CIRCLE] Broadcasting tx to ${payload.targetContract}...`);
        
        const response = await this.circleClient.createContractExecutionTransaction({
            walletId: this.walletId,
            contractAddress: payload.targetContract,
            abiFunctionSignature: payload.functionSignature,
            abiParameters: payload.abiParameters,
            feeLevel: "MEDIUM"
        });

        const txId = response.data?.id || "unknown";
        console.log(`[Relayer:CIRCLE] Submitted! Circle Tx ID: ${txId}`);
        return txId;
    }

    private async executeViaEthers(payload: TransactionPayload): Promise<string> {
        const pk = process.env.AGENT_PRIVATE_KEY || process.env.OWNER_PRIVATE_KEY;
        const rpcUrl = process.env.RPC_URL || process.env.SEPOLIA_RPC_URL || "http://127.0.0.1:8545";

        if (!pk) throw new Error("AGENT_PRIVATE_KEY is missing for LOCAL_ETHERS execution mode.");

        console.log(`[Relayer:ETHERS] Broadcasting tx to ${payload.targetContract} via ${rpcUrl}...`);

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(pk, provider);

        // Parse signature to get fragment
        const fragment = ethers.FunctionFragment.from(payload.functionSignature);
        
        // Dynamically create a contract instance with just this fragment
        const abi = [fragment.format("json")];
        const contract = new ethers.Contract(payload.targetContract, abi, wallet);

        try {
            // Native Ethers.js execution (handles gas estimation and nonces automatically)
            const tx = await contract[fragment.name](...payload.abiParameters, {
                value: payload.value || 0n
            });
            
            console.log(`[Relayer:ETHERS] Tx sent: ${tx.hash}. Waiting for confirmation...`);
            const receipt = await tx.wait();
            
            console.log(`[Relayer:ETHERS] Tx confirmed in block ${receipt.blockNumber}!`);
            return receipt.hash;
        } catch (error: any) {
            console.error(`[Relayer:ETHERS] Native execution failed:`, error);
            throw error;
        }
    }
}
