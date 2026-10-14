import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    const { treasuryId, policies } = await req.json();

    if (!treasuryId || !policies || !Array.isArray(policies)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Attach policies to the treasury
    for (const p of policies) {
      await prisma.attachedPolicy.upsert({
        where: {
          treasuryId_policyAddress: {
            treasuryId,
            policyAddress: p.address,
          },
        },
        update: {},
        create: {
          treasuryId,
          policyAddress: p.address,
          policyType: p.type,
        },
      });
    }

    // Dynamic Verification: Check if Strategy Vault criteria is met
    const attached = await prisma.attachedPolicy.findMany({
      where: { treasuryId },
    });

    const hasSwap = attached.some((p) => p.policyType === "AssetSwapPolicy");
    const hasExit = attached.some((p) => p.policyType === "StrategyExit");

    if (hasSwap && hasExit) {
      await prisma.treasury.update({
        where: { id: treasuryId },
        data: { useCaseBadge: "Strategy Vault" },
      });
    } else if (hasSwap) {
       await prisma.treasury.update({
        where: { id: treasuryId },
        data: { useCaseBadge: "Asset Manager" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error attaching policies:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
