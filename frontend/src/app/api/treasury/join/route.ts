import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

interface JoinTreasuryRequest {
  treasuryId: string;
  walletAddress: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: JoinTreasuryRequest = await req.json();

    // Validation
    if (!body.treasuryId || !body.walletAddress) {
      return NextResponse.json(
        { error: "Missing required fields: treasuryId, walletAddress" },
        { status: 400 }
      );
    }

    // Validate wallet address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(body.walletAddress)) {
      return NextResponse.json(
        { error: "Invalid Ethereum address format" },
        { status: 400 }
      );
    }

    // Check if treasury exists
    const treasury = await prisma.treasury.findUnique({
      where: { id: body.treasuryId },
    });

    if (!treasury) {
      return NextResponse.json(
        { error: "Treasury not found" },
        { status: 404 }
      );
    }

    // Find or create wallet for member
    let memberWallet = await prisma.wallet.findUnique({
      where: { address: body.walletAddress.toLowerCase() },
    });

    if (!memberWallet) {
      memberWallet = await prisma.wallet.create({
        data: {
          address: body.walletAddress.toLowerCase(),
          role: "stakeholder",
        },
      });
    }

    // Check if already a member
    const existingMember = await prisma.treasuryMember.findUnique({
      where: {
        treasuryId_memberId: {
          treasuryId: body.treasuryId,
          memberId: memberWallet.id,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member of this treasury", isMember: true },
        { status: 409 }
      );
    }

    // Add user to treasury
    const member = await prisma.treasuryMember.create({
      data: {
        treasuryId: body.treasuryId,
        memberId: memberWallet.id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Successfully joined the treasury",
        member,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error joining treasury:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
