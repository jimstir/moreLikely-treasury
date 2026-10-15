import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { treasuryId } = body;

    if (!treasuryId) {
      return NextResponse.json({ error: "treasuryId is required" }, { status: 400 });
    }

    // 1. Fetch deep treasury state from database
    const treasury = await prisma.treasury.findUnique({
      where: { id: treasuryId },
      include: {
        goals: true,
        documents: true,
        attachedPolicies: true,
        proposals: {
          where: { status: { in: ["pending", "approved"] } },
          include: { decisionReport: true }
        }
      }
    });

    if (!treasury) {
      return NextResponse.json({ error: "Treasury not found" }, { status: 404 });
    }

    // 2. Extract deployer-configurable tasks
    const enabledTasks: Record<string, boolean> = (treasury.goals?.enabledTasks as Record<string, boolean>) || {
      stopLoss: true,
      rebalancing: true,
      lending: true,
      marketMaking: false
    };

    // 3. Extract custom skill / strategy markdown if provided
    const customSkill = treasury.customSkillMd || "";

    // 4. Evaluate proposals & task alignment
    const pendingProposals = treasury.proposals.filter(p => p.status === "pending");
    const approvedProposals = treasury.proposals.filter(p => p.status === "approved");

    const evaluationResults = {
      treasuryId: treasury.id,
      treasuryAddress: treasury.address,
      agentAddress: treasury.agentAddress,
      smartWalletAddress: treasury.smartWalletAddress,
      enabledTasks,
      hasCustomSkill: Boolean(customSkill && customSkill.trim().length > 0),
      activeProposalsCount: treasury.proposals.length,
      pendingProposalsCount: pendingProposals.length,
      approvedProposalsCount: approvedProposals.length,
      recommendations: [] as Array<{
        action: string;
        proposalId?: number;
        reason: string;
      }>
    };

    // Evaluate approved proposals for execution
    for (const prop of approvedProposals) {
      evaluationResults.recommendations.push({
        action: "EXECUTE_APPROVED",
        proposalId: prop.onChainId,
        reason: `Proposal #${prop.onChainId} has passed vote and is ready for policy execution.`
      });
    }

    // Evaluate tasks based on deployer toggles
    if (enabledTasks.stopLoss) {
      // Stop-loss check enabled by deployer
      const stopLossThreshold = treasury.goals?.stopLoss || 5.0;
      // In production, this computes asset price drawdown against threshold
    } else {
      console.log(`[Governor Evaluate] Stop-loss check skipped by deployer task configuration.`);
    }

    if (enabledTasks.rebalancing) {
      // Rebalancing enabled by deployer
    }

    return NextResponse.json({
      success: true,
      evaluated: true,
      data: evaluationResults
    });

  } catch (error: any) {
    console.error("Governor Evaluate API Error:", error);
    return NextResponse.json({ error: "Failed to run evaluation loop", details: error.message }, { status: 500 });
  }
}
