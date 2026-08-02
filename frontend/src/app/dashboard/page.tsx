"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import CreateTreasuryWidget from "@/components/CreateTreasuryWidget";
import styles from "../page.module.css";

// Assuming we have basic ERC20 ABI to check balanceOf
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

export default function DashboardPage() {
  const { isConnected, isConnecting, address, isOwner, connect, provider } = useWeb3();
  const [showCreateTreasury, setShowCreateTreasury] = useState(false);
  
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "owned" | "joined">("all");
  
  // Which treasuries does the wallet have a >0 balance for?
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const openCreateTreasury = () => setShowCreateTreasury(true);
  const closeCreateTreasury = () => {
    setShowCreateTreasury(false);
    fetchTreasuries(); // Refresh list after creation
  };

  const fetchTreasuries = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/treasury`);
      if (res.ok) {
        const data = await res.json();
        setTreasuries(data);
        await checkBalances(data, address);
      }
    } catch (err) {
      console.error("Failed to fetch treasuries:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkBalances = async (allTreasuries: any[], userAddress: string) => {
    if (!provider) return;
    const joined = new Set<string>();
    
    // Check balance for each treasury token
    await Promise.all(
      allTreasuries.map(async (t) => {
        try {
          const contract = new ethers.Contract(t.tokenAddress, ERC20_ABI, provider);
          const balance = await contract.balanceOf(userAddress);
          if (balance > 0n) {
            joined.add(t.id);
          }
        } catch (err) {
          console.warn(`Could not fetch balance for ${t.tokenAddress}:`, err);
        }
      })
    );
    
    setJoinedIds(joined);
  };

  useEffect(() => {
    fetchTreasuries();
  }, [address, provider]);

  if (!isConnected) {
    return (
      <div className="container">
        <section className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔐</div>
          <h3>Wallet Not Connected</h3>
          <p>Connect your wallet to access the treasury dashboard.</p>
          <button
            className="btn btn-primary"
            onClick={connect}
            disabled={isConnecting}
          >
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </button>
          <Link href="/" className="btn btn-secondary" style={{ marginTop: 12 }}>
            Back to Home
          </Link>
        </section>
      </div>
    );
  }

  // Filter treasuries
  const filteredTreasuries = treasuries.filter(t => {
    const isOwned = t.ownerAddress.toLowerCase() === address?.toLowerCase();
    const isJoined = joinedIds.has(t.id);
    
    if (filter === "owned") return isOwned;
    if (filter === "joined") return isJoined && !isOwned; // strictly joined, not owned
    return true; // all
  });

  return (
    <div className="container">
      <section className={styles.dashboard}>
        <div className={styles.dashboardHeader}>
          <div>
            <h1>Treasury Dashboard</h1>
            <p className={styles.dashboardSubtitle}>
              {isOwner ? "Owner / Operator View" : "Stakeholder View"} —{" "}
              <span className={styles.addressMono}>
                {address?.slice(0, 6)}…{address?.slice(-4)}
              </span>
            </p>
          </div>
          <div className={styles.dashboardActions}>
            <button
              className="btn btn-primary"
              id="create-treasury-btn"
              onClick={openCreateTreasury}
            >
              + Create Treasury
            </button>
          </div>
        </div>

        {/* Filter Toggle */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button className={`btn ${filter === "all" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter("all")}>All Treasuries</button>
          <button className={`btn ${filter === "owned" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter("owned")}>Owned</button>
          <button className={`btn ${filter === "joined" ? "btn-primary" : "btn-secondary"}`} onClick={() => setFilter("joined")}>Joined</button>
        </div>

        {loading ? (
          <p>Loading Treasuries...</p>
        ) : filteredTreasuries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📭</div>
            <h3>No Treasuries Found</h3>
            <p>Create a new treasury or join an existing one to get started.</p>
            <button
              className="btn btn-primary"
              id="create-first-treasury-btn"
              onClick={openCreateTreasury}
            >
              Create Your First Treasury
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
            {filteredTreasuries.map(t => (
              <Link href={`/governor?id=${t.id}`} key={t.id} style={{ textDecoration: 'none' }}>
                <div className="glass-card" style={{ padding: "20px", transition: "transform 0.2s ease, box-shadow 0.2s ease", cursor: "pointer", height: "100%" }}>
                  <h3 style={{ margin: "0 0 10px 0", color: "var(--foreground)" }}>{t.name}</h3>
                  
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "15px" }}>
                    <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "12px", background: "rgba(255, 255, 255, 0.1)", color: "var(--foreground)" }}>
                      {t.networkName || "Sepolia Testnet"}
                    </span>
                    
                    {t.aiNetwork?.includes("0G") ? (
                      <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "12px", background: "rgba(34, 197, 94, 0.2)", color: "#4ade80", border: "1px solid rgba(34, 197, 94, 0.3)" }}>
                        ✓ Verifiable ({t.aiModel})
                      </span>
                    ) : (
                      <span style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "12px", background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
                        ⚠️ Unverified ({t.aiModel})
                      </span>
                    )}
                  </div>
                  
                  <div style={{ fontSize: "14px", color: "var(--foreground-muted)" }}>
                    <div style={{ marginBottom: "5px" }}>
                      <strong>Join Token:</strong> <span className={styles.addressMono}>
                        {t.baseAssetAddress ? `${t.baseAssetAddress.slice(0,6)}...${t.baseAssetAddress.slice(-4)}` : "None"}
                      </span>
                    </div>
                    <div style={{ marginBottom: "5px" }}>
                      <strong>Vault:</strong> <span className={styles.addressMono}>{t.address.slice(0,6)}...{t.address.slice(-4)}</span>
                    </div>
                    <div>
                      <strong>Shares:</strong> <span className={styles.addressMono}>{t.tokenAddress.slice(0,6)}...{t.tokenAddress.slice(-4)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showCreateTreasury && (
        <div className="modal-overlay" onClick={closeCreateTreasury}>
          <div
            className="modal modal-wide"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Create Treasury</h2>
              <button className="modal-close" onClick={closeCreateTreasury} aria-label="Close">
                ✕
              </button>
            </div>
            <CreateTreasuryWidget onCreated={closeCreateTreasury} />
          </div>
        </div>
      )}
    </div>
  );
}
