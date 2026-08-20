"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import { getTreasuryVault, getTreasuryToken, getERC20 } from "@/lib/contracts";
import styles from "./TreasuryStatsWidget.module.css";

interface TreasuryStats {
  name: string;
  owner: string;
  totalShareSupply: string;
  tokenCount: number;
  assets: { address: string; symbol: string; balance: string }[];
  memberCount?: number;
  baseAssetAddress?: string;
}

interface TreasuryStatsWidgetProps {
  vaultAddress?: string;
  tokenAddress?: string;
  treasuryId?: string;
}

interface DBTreasury {
  id: string;
  address: string;
  name: string;
  baseAssetAddress: string | null;
  tokenAddress: string;
  ownerAddress: string;
  owner: {
    address: string;
  };
  members: Array<{ id: string }>;
}

export default function TreasuryStatsWidget({ 
  vaultAddress, 
  tokenAddress, 
  treasuryId 
}: TreasuryStatsWidgetProps) {
  const { provider } = useWeb3();
  const [stats, setStats] = useState<TreasuryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbTreasury, setDbTreasury] = useState<DBTreasury | null>(null);

  useEffect(() => {
    const fetchTreasuryData = async () => {
      try {
        // First, try to fetch from database if treasuryId is provided
        if (treasuryId) {
          const response = await fetch(`/api/treasury?id=${treasuryId}`);
          if (response.ok) {
            const data: DBTreasury = await response.json();
            setDbTreasury(data);
            // Use addresses from database if available
            if (!vaultAddress && data.address) {
              vaultAddress = data.address;
            }
            if (!tokenAddress && data.tokenAddress) {
              tokenAddress = data.tokenAddress;
            }
          }
        }

        // If we don't have addresses, we can't fetch on-chain data
        if (!provider || !vaultAddress || !tokenAddress) {
          if (dbTreasury) {
            setStats({
              name: dbTreasury.name,
              owner: dbTreasury.owner.address,
              totalShareSupply: "0",
              tokenCount: 0,
              assets: [],
              memberCount: dbTreasury.members.length,
              baseAssetAddress: dbTreasury.baseAssetAddress || undefined,
            });
          }
          setLoading(false);
          return;
        }

        // Fetch on-chain data
        const vault = getTreasuryVault(vaultAddress, provider);
        const token = getTreasuryToken(tokenAddress, provider);

        const [name, owner, totalSupply, activeTokensList] = await Promise.all([
          vault.treasName(),
          vault.tOwner(),
          token.totalSupply(),
          vault.tokensL(),
        ]);

        // Fetch all approved token balances
        const assets: TreasuryStats["assets"] = [];
        for (const tokenAddr of activeTokensList) {
          const erc20 = getERC20(tokenAddr, provider);
          const [symbol, balance] = await Promise.all([
            erc20.symbol(),
            erc20.balanceOf(vaultAddress),
          ]);
          assets.push({
            address: tokenAddr,
            symbol,
            balance: ethers.formatEther(balance),
          });
        }

        setStats({
          name: dbTreasury?.name || name,
          owner: dbTreasury?.owner.address || owner,
          totalShareSupply: ethers.formatEther(totalSupply),
          tokenCount: count,
          assets,
          memberCount: dbTreasury?.members.length,
          baseAssetAddress: dbTreasury?.baseAssetAddress || undefined,
        });
      } catch (err) {
        console.error("Failed to fetch treasury stats:", err);
        // If we have DB data, still show it even if on-chain fetch failed
        if (dbTreasury) {
          setStats({
            name: dbTreasury.name,
            owner: dbTreasury.owner.address,
            totalShareSupply: "0",
            tokenCount: 0,
            assets: [],
            memberCount: dbTreasury.members.length,
            baseAssetAddress: dbTreasury.baseAssetAddress || undefined,
          });
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTreasuryData();
  }, [provider, vaultAddress, tokenAddress, treasuryId]);

  if (loading) {
    return (
      <div className="glass-card">
        <div className={styles.header}>
          <div className="skeleton" style={{ width: 200, height: 24 }} />
        </div>
        <div className="grid-stats" style={{ marginTop: 16 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: 80, height: 12 }} />
              <div className="skeleton" style={{ width: 120, height: 28, marginTop: 8 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Calculate simple TVL (sum of all asset balances)
  const totalAssetBalance = stats.assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);

  return (
    <div className="glass-card">
      <div className={styles.header}>
        <h2>{stats.name}</h2>
        <span className="badge badge-info">Live</span>
      </div>

      <div className="grid-stats" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <span className="stat-label">Total Value Locked</span>
          <span className="stat-value">{totalAssetBalance.toFixed(4)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Share Supply</span>
          <span className="stat-value">{parseFloat(stats.totalShareSupply).toFixed(4)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Approved Assets</span>
          <span className="stat-value">{stats.tokenCount}</span>
        </div>
        {stats.memberCount !== undefined && (
          <div className="stat-card">
            <span className="stat-label">Members</span>
            <span className="stat-value">{stats.memberCount}</span>
          </div>
        )}
      </div>

      {stats.assets.length > 0 && (
        <div className={styles.assetList}>
          <h4 style={{ marginBottom: 12 }}>Vault Holdings</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Address</th>
              </tr>
            </thead>
            <tbody>
              {stats.assets.map((asset) => (
                <tr key={asset.address}>
                  <td>
                    <span className={styles.assetSymbol}>{asset.symbol}</span>
                  </td>
                  <td>{parseFloat(asset.balance).toFixed(6)}</td>
                  <td className={styles.addressCell}>
                    {asset.address.slice(0, 6)}…{asset.address.slice(-4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.ownerRow}>
        <span className="stat-label">Vault Owner</span>
        <span className={styles.ownerAddress}>
          {stats.owner.slice(0, 6)}…{stats.owner.slice(-4)}
        </span>
      </div>
      
      {stats.baseAssetAddress && (
        <div className={styles.ownerRow}>
          <span className="stat-label">Base Asset</span>
          <span className={styles.ownerAddress}>
            {stats.baseAssetAddress.slice(0, 6)}…{stats.baseAssetAddress.slice(-4)}
          </span>
        </div>
      )}
    </div>
  );
}
