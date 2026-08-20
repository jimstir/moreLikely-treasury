import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** GET /api/trust-profile?treasuryId=&walletAddress=
 *  Returns an existing TrustProfile row or 404.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const treasuryId = searchParams.get("treasuryId");
  const walletAddress = searchParams.get("walletAddress")?.toLowerCase();

  if (!treasuryId || !walletAddress) {
    return NextResponse.json({ error: "treasuryId and walletAddress are required" }, { status: 400 });
  }

  const profile = await prisma.trustProfile.findUnique({
    where: { walletAddress_treasuryId: { walletAddress, treasuryId } },
  });

  if (!profile) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(profile);
}

/** POST /api/trust-profile
 *  Creates or returns an existing profile request row.
 *  Body: { treasuryId, walletAddress, overallScore?, scores? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { treasuryId, walletAddress: rawWallet, overallScore, scores } = body;
  const walletAddress = rawWallet?.toLowerCase();

  if (!treasuryId || !walletAddress) {
    return NextResponse.json({ error: "treasuryId and walletAddress are required" }, { status: 400 });
  }

  const profile = await prisma.trustProfile.upsert({
    where: { walletAddress_treasuryId: { walletAddress, treasuryId } },
    create: {
      walletAddress,
      treasuryId,
      overallScore: overallScore ?? 0,
      scores: scores ?? undefined,
      lastComputedAt: new Date(),
    },
    update: {
      overallScore: overallScore ?? undefined,
      scores: scores ?? undefined,
      lastComputedAt: new Date(),
    },
  });

  return NextResponse.json(profile);
}
