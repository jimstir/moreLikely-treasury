import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { hasActiveSubscription } from "@/lib/subscription";
import { generateAiOverlay } from "@/lib/ai-agent";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { treasuryId, walletAddress: rawWallet } = body;
    const walletAddress = rawWallet?.toLowerCase();

    if (!treasuryId || !walletAddress) {
      return NextResponse.json({ error: "treasuryId and walletAddress are required" }, { status: 400 });
    }

    // 1. Check Subscription
    const isActive = await hasActiveSubscription(walletAddress);
    if (!isActive) {
      return NextResponse.json({ error: "Active subscription required for AI Contextual Overlay." }, { status: 403 });
    }

    // 2. Fetch the existing Layer 1 Trust Profile
    const profile = await prisma.trustProfile.findUnique({
      where: { walletAddress_treasuryId: { walletAddress, treasuryId } },
      include: { treasury: { include: { goals: true, documents: true } } },
    });

    if (!profile || !profile.scores) {
      return NextResponse.json({ error: "Layer 1 Trust Profile not found. Please generate the base profile first." }, { status: 404 });
    }

    // 3. Extract the Mandate
    const mandateDoc = profile.treasury?.documents?.find(d => d.documentType === "mandate");
    const mandate = mandateDoc ? mandateDoc.fileUri : "No specific mandate provided.";

    // 4. Call the LLM to generate the Layer 2 Overlay
    const layer1Scores: any = profile.scores;
    const aiOverlay = await generateAiOverlay(layer1Scores, mandate);

    // 5. Save the updated AI overlay back to the profile
    const updatedProfile = await prisma.trustProfile.update({
      where: { id: profile.id },
      data: {
        aiOverlay: aiOverlay as any,
        lastComputedAt: new Date(),
      },
    });

    return NextResponse.json(updatedProfile);
  } catch (error: any) {
    console.error("AI Audit Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
