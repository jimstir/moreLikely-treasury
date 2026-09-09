import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const treasuryId = searchParams.get("treasuryId");

    if (!treasuryId) {
      return NextResponse.json(
        { error: "treasuryId is required" },
        { status: 400 }
      );
    }

    // Fetch the daily performance tracking values, ascending by date
    const performanceHistory = await prisma.treasuryPerformance.findMany({
      where: { treasuryId },
      orderBy: { date: 'asc' },
    });

    return NextResponse.json(performanceHistory);
  } catch (error) {
    console.error("Error fetching treasury performance:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
