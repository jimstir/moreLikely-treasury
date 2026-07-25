"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import { getERC20, getTreasuryVault } from "@/lib/contracts";
import styles from "./JoinTreasuryModal.module.css";

interface JoinTreasuryModalProps {
  vaultAddress: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function JoinTreasuryModal({ vaultAddress, onClose, onSuccess }: JoinTreasuryModalProps) {
  const { provider, signer, address } = useWeb3();
  const [tokenAddress, setTokenAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"input" | "approving" | "depositing" | "success">("input");
  const [error, setError] = useState<string | null>(null);
  const [userBalance, setUserBalance] = useState<string | null>(null);
  const [tokenSymbol, setTokenSymbol] = useState<string>("");

  useEffect(() => {
    const fetchBalance = async () => {
      if (!provider || !address || !tokenAddress) return;
      if (tokenAddress.length !== 42 || !tokenAddress.startsWith("0x")) {
        setUserBalance(null);
        setTokenSymbol("");
        return;
      }
      try {
        const token = getERC20(tokenAddress, provider);
        const [symbol, bal] = await Promise.all([
          token.symbol(),
          token.balanceOf(address)
        ]);
        setTokenSymbol(symbol);
        setUserBalance(ethers.formatEther(bal));
      } catch (err) {
        // Handle invalid token address gracefully
        setUserBalance(null);
        setTokenSymbol("");
      }
    };
    fetchBalance();
  }, [provider, address, tokenAddress]);

  const handleDeposit = async () => {
    if (!signer || !address) return;
    setError(null);
    try {
      const amountWei = ethers.parseEther(amount);
      const token = getERC20(tokenAddress, signer);
      const vault = getTreasuryVault(vaultAddress, signer);

      // 1. Check approval
      setStep("approving");
      const currentAllowance = await token.allowance(address, vaultAddress);
      if (currentAllowance < amountWei) {
        const tx = await token.approve(vaultAddress, amountWei);
        await tx.wait();
      }

      // 2. Deposit
      setStep("depositing");
      // joinTreasury(address _token, uint256 _amount, bool _isProposal, uint256 _proposalNum)
      const tx2 = await vault.joinTreasury(tokenAddress, amountWei, false, 0);
      await tx2.wait();

      setStep("success");
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to join treasury.");
      setStep("input");
    }
  };

  const isFormValid = tokenAddress.length === 42 && parseFloat(amount) > 0 && userBalance && parseFloat(amount) <= parseFloat(userBalance);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">Join Treasury</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {step === "input" && (
          <div className={styles.form}>
            <div className={styles.field}>
              <label className="label" htmlFor="tokenAddress">ERC20 Token Address</label>
              <input
                className="input"
                id="tokenAddress"
                placeholder="0x..."
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
              />
              {userBalance && (
                <div className={styles.balanceInfo}>
                  Balance: {parseFloat(userBalance).toFixed(4)} {tokenSymbol}
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label className="label" htmlFor="amount">Deposit Amount</label>
              <div className={styles.inputGroup}>
                <input
                  className="input"
                  id="amount"
                  type="number"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.0001"
                />
                <button
                  className={styles.maxBtn}
                  onClick={() => setAmount(userBalance || "0")}
                  disabled={!userBalance}
                  type="button"
                >
                  MAX
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-danger">
                <span>⚠️ {error}</span>
              </div>
            )}

            <button
              className="btn btn-primary btn-lg"
              style={{ width: "100%", marginTop: 16 }}
              onClick={handleDeposit}
              disabled={!isFormValid}
            >
              Approve & Deposit
            </button>
          </div>
        )}

        {(step === "approving" || step === "depositing") && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p className={styles.statusText}>
              {step === "approving" ? "Approving token transfer..." : "Depositing to treasury vault..."}
            </p>
            <p className={styles.hintText}>Please confirm the transaction in your wallet.</p>
          </div>
        )}

        {step === "success" && (
          <div className={styles.successState}>
            <div className={styles.successIcon}>🎉</div>
            <h3>Successfully Joined!</h3>
            <p>You are now a stakeholder in this treasury.</p>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 16 }}>
              View Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
