"use client";

import { useState } from "react";
import Link from "next/link";
import { useWeb3 } from "@/context/Web3Context";
import CreateTreasuryWidget from "@/components/CreateTreasuryWidget";
import styles from "../page.module.css";

export default function DashboardPage() {
  const { isConnected, isConnecting, address, isOwner, connect } = useWeb3();
  const [showCreateTreasury, setShowCreateTreasury] = useState(false);

  const openCreateTreasury = () => setShowCreateTreasury(true);
  const closeCreateTreasury = () => setShowCreateTreasury(false);

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
            <button className="btn btn-secondary" id="join-treasury-btn">
              Join Treasury
            </button>
          </div>
        </div>

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
