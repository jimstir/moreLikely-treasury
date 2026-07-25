import { NextResponse } from "next/server";
// import { PrismaClient } from "@prisma/client";
// const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { proposalId, disputerAddress, reason, evidence, txHash } = body;

    if (!proposalId || !disputerAddress || !reason || !evidence || !txHash) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Save dispute to database using Prisma
    /*
    await prisma.dispute.create({
      data: {
        proposalId: String(proposalId),
        disputerId: disputerAddress,
        reason,
        evidence,
        txHash,
        reviewPeriodEnd: new Date(Date.now() + 86400000) // 24 hours
      }
    });
    */

    return NextResponse.json({
      success: true,
      pausedUntil: new Date(Date.now() + 86400000).toISOString()
    });

  } catch (error: any) {
    console.error("Audit Report API Error:", error);
    return NextResponse.json({ error: "Failed to log dispute" }, { status: 500 });
  }
}
