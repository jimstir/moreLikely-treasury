import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const walletAddress = searchParams.get("walletAddress");
    const type = searchParams.get("type"); // "owned" | "joined" | "all"

    // Get treasury by ID
    if (id) {
      const treasury = await prisma.treasury.findUnique({
        where: { id },
        include: {
          owner: true,
          members: {
            include: { member: true },
          },
          goals: true,
        },
      });

      if (!treasury) {
        return NextResponse.json(
          { error: "Treasury not found" },
          { status: 404 }
        );
      }

      return NextResponse.json(treasury);
    }

    // Get treasuries by wallet address
    if (walletAddress) {
      const wallet = await prisma.wallet.findUnique({
        where: { address: walletAddress.toLowerCase() },
      });

      if (!wallet) {
        // Return empty arrays if wallet doesn't exist
        return NextResponse.json({
          ownedTreasuries: [],
          joinedTreasuries: [],
          allTreasuries: [],
        });
      }

      if (type === "owned") {
        const ownedTreasuries = await prisma.treasury.findMany({
          where: { ownerId: wallet.id },
          include: {
            owner: true,
            members: true,
            goals: true,
          },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(ownedTreasuries);
      }

      if (type === "joined") {
        const joinedTreasuries = await prisma.treasuryMember.findMany({
          where: { memberId: wallet.id },
          include: {
            treasury: {
              include: {
                owner: true,
                members: true,
                goals: true,
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        });
        return NextResponse.json(joinedTreasuries.map((m) => m.treasury));
      }

      if (type === "all") {
        const ownedTreasuries = await prisma.treasury.findMany({
          where: { ownerId: wallet.id },
          include: {
            owner: true,
            members: true,
            goals: true,
          },
          orderBy: { createdAt: "desc" },
        });

        const joinedTreasuries = await prisma.treasuryMember.findMany({
          where: { memberId: wallet.id },
          include: {
            treasury: {
              include: {
                owner: true,
                members: true,
                goals: true,
              },
            },
          },
          orderBy: { joinedAt: "desc" },
        });

        return NextResponse.json({
          ownedTreasuries,
          joinedTreasuries: joinedTreasuries.map((m) => m.treasury),
        });
      }
    }

    // Get all treasuries on the platform
    const allTreasuries = await prisma.treasury.findMany({
      include: {
        owner: true,
        members: true,
        goals: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(allTreasuries);
  } catch (error) {
    console.error("Error fetching treasuries:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
