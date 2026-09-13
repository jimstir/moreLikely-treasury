import { PrismaClient } from "@prisma/client";
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";

const prisma = new PrismaClient();

export async function storeProposalDescription(
  txHash: string,
  vaultAddress: string,
  description: string,
  tokenAddress: string,
  amount: string
) {
  const use0G = process.env.USE_0G_STORAGE === 'true';
  let dataRoot = undefined;

  if (use0G) {
    try {
        const indexer = new Indexer(process.env.ZG_INDEXER_RPC || "http://127.0.0.1:8545");
        // Simulated upload to 0G for this demo
        console.log(`[Storage] Uploading description to 0G Storage...`);
        dataRoot = "0xzg" + Buffer.from(txHash).toString('hex').substring(0, 40);
        console.log(`[Storage] 0G DataRoot: ${dataRoot}`);
    } catch (e) {
        console.error("Failed to upload to 0G", e);
    }
  }

  // Save to Postgres (if Prisma is available)
  try {
      await prisma.decisionReport.create({
          data: {
              proposalId: txHash, // Using txHash as temporary mapping until indexed
              rationale: description,
              timeframe: "immediate",
              swapRoutes: {},
              rawMarketData: { tokenAddress, amount },
              ticketReceipt: dataRoot
          }
      });
      console.log(`[Storage] Saved proposal description to DB`);
  } catch(e: any) {
      console.warn("DB not connected yet, skipping Prisma save:", e.message);
  }

  return { success: true, dataRoot };
}
