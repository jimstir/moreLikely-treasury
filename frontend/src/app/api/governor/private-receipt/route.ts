import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      treasuryId,
      proposalId,
      onChainProposalId,
      invocationId,
      transcriptHash,
      signature,
      timestamp,
      rationale,
      timeframe,
      swapRoutes,
      rawMarketData
    } = body;

    if (!treasuryId || !invocationId || !transcriptHash || !signature || !timestamp) {
      return NextResponse.json(
        { error: "Missing required fields: treasuryId, invocationId, transcriptHash, signature, timestamp" },
        { status: 400 }
      );
    }

    // 1. Fetch the Treasury and its registered agent address
    const treasury = await prisma.treasury.findUnique({
      where: { id: treasuryId }
    });

    if (!treasury) {
      return NextResponse.json({ error: "Treasury not found" }, { status: 404 });
    }

    if (!treasury.agentAddress) {
      return NextResponse.json(
        { error: "No agentAddress registered for this treasury. Configure agentAddress first." },
        { status: 400 }
      );
    }

    // 2. Verify signature against registered agentAddress
    const expectedMessage = `${treasuryId}:${invocationId}:${transcriptHash}:${timestamp}`;
    let recoveredAddress: string | null = null;

    try {
      recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
    } catch {
      // Check if signed as raw byte digest
      try {
        const hash = ethers.keccak256(ethers.toUtf8Bytes(expectedMessage));
        recoveredAddress = ethers.verifyMessage(ethers.getBytes(hash), signature);
      } catch (err: any) {
        return NextResponse.json(
          { error: "Malformed signature or message encoding", details: err.message },
          { status: 400 }
        );
      }
    }

    if (!recoveredAddress || recoveredAddress.toLowerCase() !== treasury.agentAddress.toLowerCase()) {
      return NextResponse.json(
        {
          error: "Signature verification failed: signer does not match registered agentAddress",
          expected: treasury.agentAddress,
          recovered: recoveredAddress
        },
        { status: 401 }
      );
    }

    // 3. Find proposal if proposalId or onChainProposalId is supplied
    let matchedProposal: any = null;
    if (proposalId) {
      matchedProposal = await prisma.proposal.findUnique({
        where: { id: proposalId }
      });
    } else if (onChainProposalId !== undefined) {
      matchedProposal = await prisma.proposal.findFirst({
        where: {
          treasuryId: treasury.id,
          onChainId: Number(onChainProposalId)
        }
      });
    }

    let reportId: string | null = null;

    // 4. Persist DecisionReport if proposal exists
    if (matchedProposal) {
      const report = await prisma.decisionReport.upsert({
        where: { proposalId: matchedProposal.id },
        create: {
          proposalId: matchedProposal.id,
          rationale: rationale || "Self-hosted private agent verified evaluation",
          timeframe: timeframe || "short-term",
          swapRoutes: swapRoutes || {},
          rawMarketData: rawMarketData || {},
          ticketReceipt: transcriptHash
        },
        update: {
          rationale: rationale || "Self-hosted private agent verified evaluation",
          timeframe: timeframe || "short-term",
          swapRoutes: swapRoutes || {},
          rawMarketData: rawMarketData || {},
          ticketReceipt: transcriptHash
        }
      });
      reportId = report.id;
    }

    return NextResponse.json({
      success: true,
      verified: true,
      signer: recoveredAddress,
      treasuryId: treasury.id,
      proposalId: matchedProposal ? matchedProposal.id : null,
      reportId
    });

  } catch (error: any) {
    console.error("Private Receipt Verification Error:", error);
    return NextResponse.json(
      { error: "Internal server error verifying private receipt", details: error.message },
      { status: 500 }
    );
  }
}
