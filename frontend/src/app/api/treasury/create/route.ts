import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();

interface CreateTreasuryRequest {
  name: string;
  tokenName: string;
  tokenSymbol: string;
  vaultAddress: string;
  tokenAddress: string;
  ownerAddress: string;
  baseAssetAddress?: string;
  networkName: string;
  chainId: number;
  aiNetwork: string;
  aiModel: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: CreateTreasuryRequest = await req.json();

    // Validation
    if (!body.name || !body.tokenName || !body.tokenSymbol || !body.vaultAddress || !body.tokenAddress || !body.ownerAddress || !body.networkName || !body.chainId || !body.aiNetwork || !body.aiModel) {
      return NextResponse.json(
        { error: "Missing required fields: name, tokenName, tokenSymbol, vaultAddress, tokenAddress, ownerAddress, networkName, chainId, aiNetwork, aiModel" },
        { status: 400 }
      );
    }

    // Validate addresses (basic check)
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(body.vaultAddress) || !addressRegex.test(body.tokenAddress) || !addressRegex.test(body.ownerAddress)) {
      return NextResponse.json(
        { error: "Invalid Ethereum address format" },
        { status: 400 }
      );
    }

    // Check if vault address already exists
    const existingTreasury = await prisma.treasury.findUnique({
      where: { address: body.vaultAddress },
    });

    if (existingTreasury) {
      return NextResponse.json(
        { error: "Treasury with this vault address already exists" },
        { status: 409 }
      );
    }

    // Check if token address already exists
    const existingToken = await prisma.treasury.findUnique({
      where: { tokenAddress: body.tokenAddress },
    });

    if (existingToken) {
      return NextResponse.json(
        { error: "Treasury with this token address already exists" },
        { status: 409 }
      );
    }

    // Find or create wallet for owner
    let ownerWallet = await prisma.wallet.findUnique({
      where: { address: body.ownerAddress.toLowerCase() },
    });

    if (!ownerWallet) {
      ownerWallet = await prisma.wallet.create({
        data: {
          address: body.ownerAddress.toLowerCase(),
          role: "owner",
        },
      });
    } else if (ownerWallet.role !== "owner") {
      // Update role to owner if it wasn't already
      ownerWallet = await prisma.wallet.update({
        where: { id: ownerWallet.id },
        data: { role: "owner" },
      });
    }

    // Create Treasury
    const treasury = await prisma.treasury.create({
      data: {
        address: body.vaultAddress,
        name: body.name,
        baseAssetAddress: body.baseAssetAddress || null,
        tokenAddress: body.tokenAddress,
        ownerAddress: body.ownerAddress.toLowerCase(),
        ownerId: ownerWallet.id,
        networkName: body.networkName,
        chainId: body.chainId,
        aiNetwork: body.aiNetwork,
        aiModel: body.aiModel,
      },
    });

    return NextResponse.json(
      {
        success: true,
        treasuryId: treasury.id,
        message: "Treasury created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating treasury:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
