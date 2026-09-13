"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import { getTreasuryVault, getERC20 } from "@/lib/contracts";

interface AssetData {
  address: string;
  symbol: string;
  balance: string;
}

interface AssetListWidgetProps {
  vaultAddress: string;
}

export default function AssetListWidget({ vaultAddress }: AssetListWidgetProps) {
  const { provider } = useWeb3();
  const [assets, setAssets] = useState<AssetData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!provider) return;

    const fetchAssets = async () => {
      try {
        const vault = getTreasuryVault(vaultAddress, provider);
        const tokenListLength = await vault.tokenListLength();
        const count = Number(tokenListLength);
        
        const fetchedAssets: AssetData[] = [];
        
        for (let i = 0; i < count; i++) {
          const tokenAddr = await vault.listToken(i);
          const erc20 = getERC20(tokenAddr, provider);
          const [symbol, balance] = await Promise.all([
            erc20.symbol(),
            erc20.balanceOf(vaultAddress),
          ]);
          
          fetchedAssets.push({
            address: tokenAddr,
            symbol,
            balance: ethers.formatEther(balance)
          });
        }
        
        setAssets(fetchedAssets);
      } catch (err) {
        console.error("Failed to fetch assets:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAssets();
  }, [provider, vaultAddress]);

  if (loading) {
    return (
      <div className="glass-card">
        <h3>Treasury Assets</h3>
        <div className="skeleton" style={{ width: "100%", height: 120, marginTop: 16 }} />
      </div>
    );
  }

  return (
    <div className="glass-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3>Treasury Assets</h3>
        <span className="badge badge-success">On-Chain Balances</span>
      </div>

      {assets.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No approved assets found in this treasury.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.address}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 600, color: "var(--accent-blue-light)" }}>{asset.symbol}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {asset.address.slice(0, 6)}…{asset.address.slice(-4)}
                      </span>
                    </div>
                  </td>
                  <td>{parseFloat(asset.balance).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
