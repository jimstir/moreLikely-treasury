import { NextResponse } from "next/server";
import { storeProposalDescription } from "@/lib/storage";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { vaultAddress, txHash, description, tokenAddress, amount } = body;

        if (!txHash || !description) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const result = await storeProposalDescription(txHash, vaultAddress, description, tokenAddress, amount);
        
        return NextResponse.json({ success: true, dataRoot: result.dataRoot });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
