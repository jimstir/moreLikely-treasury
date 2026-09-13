import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { treasuryId, documentType, markdownContent, isPrivateOverride, signature, signerAddress } = body;

    if (!treasuryId || !documentType || !markdownContent || !signature || !signerAddress) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // 1. JSON.parse() Validation (MVP Security)
    // Extract JSON blocks from the markdown to ensure the user didn't break them.
    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/g;
    let match;
    const extractedConfigs: Record<string, any> = {};

    while ((match = jsonBlockRegex.exec(markdownContent)) !== null) {
      try {
        const parsedBlock = JSON.parse(match[1]);
        Object.assign(extractedConfigs, parsedBlock);
      } catch (e) {
        return NextResponse.json(
          { error: "Invalid JSON formatting in the document. Please ensure you didn't delete any brackets { } in the configuration blocks." },
          { status: 422 }
        );
      }
    }

    // 2. Cryptographic Integrity (SHA-256 Hash)
    // Hash the raw markdown content exactly as it was received
    const fileHash = ethers.sha256(ethers.toUtf8Bytes(markdownContent));

    // 3. EIP-712 Signature Verification
    // Verify that the provided signature matches the signerAddress and the fileHash
    const expectedMessage = `I authorize the update to ${documentType} with hash: ${fileHash}`;
    const recoveredAddress = ethers.verifyMessage(expectedMessage, signature);
    
    if (recoveredAddress.toLowerCase() !== signerAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Cryptographic signature verification failed. Unauthorized." },
        { status: 401 }
      );
    }

    // Verify the signer is actually the Treasury Owner (or an authorized admin)
    const treasury = await prisma.treasury.findUnique({
      where: { id: treasuryId },
      include: { owner: true }
    });

    if (!treasury || treasury.owner.address !== signerAddress.toLowerCase()) {
      return NextResponse.json(
        { error: "Only the Treasury Owner can update this document." },
        { status: 403 }
      );
    }

    // 4. Storage & Database Pointer Update
    // In a production environment, this is where you would upload `markdownContent` to AWS S3, Google Cloud, or 0G Storage.
    // For this MVP backend logic, we will mock the URI generation.
    const mockStorageUri = `https://platform-storage.com/treasuries/${treasuryId}/${documentType}_${Date.now()}.md`;

    const updatedDocument = await prisma.treasuryDocument.upsert({
      where: {
        treasuryId_documentType: {
          treasuryId: treasuryId,
          documentType: documentType
        }
      },
      update: {
        fileUri: mockStorageUri,
        fileHash: fileHash,
        signature: signature,
        isPrivateOverride: isPrivateOverride,
        lastUpdatedTimestamp: new Date()
      },
      create: {
        treasuryId: treasuryId,
        documentType: documentType,
        fileUri: mockStorageUri,
        fileHash: fileHash,
        signature: signature,
        isPrivateOverride: isPrivateOverride,
        storageMode: "MODE_A_STANDARD"
      }
    });

    // Optionally update the TreasuryGoals table with the extracted JSON configurations
    if (documentType === "mandate" && Object.keys(extractedConfigs).length > 0) {
      await prisma.treasuryGoals.upsert({
        where: { treasuryId: treasuryId },
        update: {
          slippageLimit: extractedConfigs.slippageLimit,
          stopLoss: extractedConfigs.stopLoss,
          maxTreasuryPercentage: extractedConfigs.maxTreasuryPercentage,
          targetAllocations: extractedConfigs.targetAllocations
        },
        create: {
          treasuryId: treasuryId,
          slippageLimit: extractedConfigs.slippageLimit,
          stopLoss: extractedConfigs.stopLoss,
          maxTreasuryPercentage: extractedConfigs.maxTreasuryPercentage,
          targetAllocations: extractedConfigs.targetAllocations || {}
        }
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Document successfully parsed, verified, and saved.",
        document: updatedDocument
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error saving document:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
