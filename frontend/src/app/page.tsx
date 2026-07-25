"use client";

import Link from "next/link";
import { useWeb3 } from "@/context/Web3Context";
import styles from "./page.module.css";

export default function Home() {
  const { isConnected, isConnecting, connect } = useWeb3();

  return (
    <div className="container">
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <h1 className={styles.heroTitle}>
          Smart Treasury
          <span className={styles.heroAccent}> Management</span>
        </h1>
        <p className={styles.heroSubtitle}>
          Deploy, govern, and optimize tokenized treasuries with AI-powered decision making
          on the 0G decentralized compute network.
        </p>
        <div className={styles.heroActions}>
          {isConnected ? (
            <Link href="/dashboard" className="btn btn-primary btn-lg" id="hero-dashboard-btn">
              Go to Dashboard
            </Link>
          ) : (
            <button
              className="btn btn-primary btn-lg"
              onClick={connect}
              disabled={isConnecting}
              id="hero-connect-btn"
            >
              {isConnecting ? "Connecting…" : "Connect Wallet to Get Started"}
            </button>
          )}
        </div>

        <div className={styles.featureGrid}>
          <div className={`glass-card ${styles.featureCard}`}>
            <div className={styles.featureIcon}>🏦</div>
            <h3>Tokenized Vaults</h3>
            <p>ERC-4626 compliant vaults with ERC20-only deposits and proportional share minting.</p>
          </div>
          <div className={`glass-card ${styles.featureCard}`}>
            <div className={styles.featureIcon}>🤖</div>
            <h3>AI Governor</h3>
            <p>Autonomous trade proposals powered by 0G Compute Network LLM inference with on-chain attestations.</p>
          </div>
          <div className={`glass-card ${styles.featureCard}`}>
            <div className={styles.featureIcon}>🗳️</div>
            <h3>Gasless Voting</h3>
            <p>Off-chain EIP-712 signature voting. Stakeholders vote without paying gas fees.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
