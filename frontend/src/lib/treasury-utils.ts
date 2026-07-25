/**
 * Treasury utility functions for API interactions
 */

export interface TreasuryData {
  id: string;
  address: string;
  name: string;
  baseAssetAddress: string | null;
  tokenAddress: string;
  ownerAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface TreasuryMemberData {
  id: string;
  treasuryId: string;
  memberId: string;
  joinedAt: string;
}

/**
 * Create a new treasury
 */
export async function createTreasury(data: {
  name: string;
  tokenName: string;
  tokenSymbol: string;
  vaultAddress: string;
  tokenAddress: string;
  ownerAddress: string;
  baseAssetAddress?: string;
}): Promise<{ treasuryId: string; success: boolean }> {
  const response = await fetch("/api/treasury/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create treasury");
  }

  return response.json();
}

/**
 * Get all treasuries
 */
export async function getAllTreasuries(): Promise<TreasuryData[]> {
  const response = await fetch("/api/treasury");
  if (!response.ok) throw new Error("Failed to fetch treasuries");
  return response.json();
}

/**
 * Get treasury by ID
 */
export async function getTreasuryById(id: string): Promise<TreasuryData> {
  const response = await fetch(`/api/treasury?id=${id}`);
  if (!response.ok) throw new Error("Failed to fetch treasury");
  return response.json();
}

/**
 * Get treasuries for a wallet address
 */
export async function getUserTreasuries(
  walletAddress: string,
  type: "owned" | "joined" | "all" = "all"
): Promise<TreasuryData[] | { ownedTreasuries: TreasuryData[]; joinedTreasuries: TreasuryData[] }> {
  const response = await fetch(
    `/api/treasury?walletAddress=${walletAddress}&type=${type}`
  );
  if (!response.ok) throw new Error("Failed to fetch user treasuries");
  return response.json();
}

/**
 * Get treasuries owned by a wallet
 */
export async function getOwnedTreasuries(
  walletAddress: string
): Promise<TreasuryData[]> {
  const response = await fetch(
    `/api/treasury?walletAddress=${walletAddress}&type=owned`
  );
  if (!response.ok) throw new Error("Failed to fetch owned treasuries");
  return response.json();
}

/**
 * Get treasuries joined by a wallet
 */
export async function getJoinedTreasuries(
  walletAddress: string
): Promise<TreasuryData[]> {
  const response = await fetch(
    `/api/treasury?walletAddress=${walletAddress}&type=joined`
  );
  if (!response.ok) throw new Error("Failed to fetch joined treasuries");
  return response.json();
}

/**
 * Join a treasury
 */
export async function joinTreasury(
  treasuryId: string,
  walletAddress: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch("/api/treasury/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ treasuryId, walletAddress }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to join treasury");
  }

  return response.json();
}
