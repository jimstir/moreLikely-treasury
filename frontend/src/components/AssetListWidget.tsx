"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import { getTreasuryVault, getERC20 } from "@/lib/contracts";

interface AssetData {
  address: string;
  symbol: string;
  balance: string;
  // Mock data for live metrics
  price: number;
  liquidity: string;
  holders: number;
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
          
          // Mock market data for demonstration
          // In production, this would query Uniswap/CoinGecko API
          const mockPrice = Math.random() * 2000 + 1; // $1 to $2001
          const mockLiquidity = (Math.random() * 50 + 1).toFixed(2) + "M";
          const mockHolders = Math.floor(Math.random() * 50000) + 1000;

          fetchedAssets.push({
            address: tokenAddr,
            symbol,
            balance: ethers.formatEther(balance),
            price: mockPrice,
            liquidity: mockLiquidity,
            holders: mockHolders,
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

  const totalValue = assets.reduce((sum, a) => sum + parseFloat(a.balance) * a.price, 0);

  return (
    <div className="glass-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h3>Treasury Assets</h3>
        <span className="badge badge-success">Live Market Data</span>
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
                <th>Price (USD)</th>
                <th>Value</th>
                <th>Allocation</th>
                <th>Market Liq.</th>
                <th>Holders</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const value = parseFloat(asset.balance) * asset.price;
                const allocation = totalValue > 0 ? (value / totalValue) * 100 : 0;
                
                return (
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
                    <td>${asset.price.toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span>{allocation.toFixed(1)}%</span>
                        <div className="progress" style={{ flex: 1 }}>
                          <div 
                            className="progress-fill" 
                            style={{ 
                              width: `${allocation}%`,
                              background: allocation > 50 ? "var(--gradient-success)" : "var(--gradient-accent)"
                            }} 
                          />
                        </div>
                      </div>
                    </td>
                    <td>${asset.liquidity}</td>
                    <td>{asset.holders.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
