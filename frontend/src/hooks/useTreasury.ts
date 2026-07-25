import { useState, useEffect } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { 
  getAllTreasuries, 
  getOwnedTreasuries, 
  getJoinedTreasuries,
  TreasuryData 
} from "@/lib/treasury-utils";

interface UseTreasuryDataResult {
  allTreasuries: TreasuryData[];
  ownedTreasuries: TreasuryData[];
  joinedTreasuries: TreasuryData[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to manage treasury data for the current user
 */
export function useTreasuryData(): UseTreasuryDataResult {
  const { address } = useWeb3();
  const [allTreasuries, setAllTreasuries] = useState<TreasuryData[]>([]);
  const [ownedTreasuries, setOwnedTreasuries] = useState<TreasuryData[]>([]);
  const [joinedTreasuries, setJoinedTreasuries] = useState<TreasuryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all treasuries
      const all = await getAllTreasuries();
      setAllTreasuries(all);

      // If user is connected, fetch their treasuries
      if (address) {
        const owned = await getOwnedTreasuries(address);
        const joined = await getJoinedTreasuries(address);
        setOwnedTreasuries(owned);
        setJoinedTreasuries(joined);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch treasuries");
      console.error("Error fetching treasury data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [address]);

  return {
    allTreasuries,
    ownedTreasuries,
    joinedTreasuries,
    loading,
    error,
    refetch: fetchData,
  };
}

/**
 * Hook to track a specific treasury by ID
 */
export function useTreasury(treasuryId?: string) {
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [loading, setLoading] = useState(!!treasuryId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!treasuryId) return;

    const fetchTreasury = async () => {
      try {
        setLoading(true);
        setError(null);
        const { getTreasuryById } = await import("@/lib/treasury-utils");
        const data = await getTreasuryById(treasuryId);
        setTreasury(data);
      } catch (err: any) {
        setError(err.message || "Failed to fetch treasury");
        console.error("Error fetching treasury:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTreasury();
  }, [treasuryId]);

  return { treasury, loading, error };
}
