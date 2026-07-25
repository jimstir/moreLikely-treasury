"use client";

import Link from "next/link";
import { useWeb3 } from "@/context/Web3Context";
import styles from "./ConnectWalletModal.module.css";

const SUPPORTED_CHAINS: Record<number, string> = {
  1: "Ethereum Mainnet",
  11155111: "Sepolia Testnet",
  31337: "Hardhat Local",
};

export default function ConnectWalletModal() {
  const { isConnected, isConnecting, address, chainId, isOwner, error, connect, disconnect } = useWeb3();

  if (isConnected) {
    return (
      <div className={styles.navbarWallet}>
        <Link href="/dashboard" className="btn btn-primary" id="go-to-dashboard-btn">
          Go to Dashboard
        </Link>
        <div className={styles.connectedPill}>
          <div className={styles.statusDot} />
          <div className={styles.connectedInfo}>
            <span className={styles.network}>
              {chainId && SUPPORTED_CHAINS[chainId] ? SUPPORTED_CHAINS[chainId] : `Chain ${chainId}`}
            </span>
            <span className={styles.address}>
              {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
            </span>
          </div>
          {isOwner && <span className="badge badge-info">Owner</span>}
          <button className={styles.disconnectBtn} onClick={disconnect} title="Disconnect">
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button className="btn btn-primary" onClick={connect} disabled={isConnecting} id="connect-wallet-btn">
        {isConnecting ? (
          <>
            <span className={styles.spinner} />
            Connecting…
          </>
        ) : (
          "Connect Wallet"
        )}
      </button>

      {error && (
        <div className={styles.errorToast}>
          <span>⚠️ {error}</span>
        </div>
      )}
    </>
  );
}
