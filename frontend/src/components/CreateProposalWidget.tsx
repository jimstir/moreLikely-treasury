"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import styles from "./CreateTreasuryWidget.module.css";

interface CreateProposalWidgetProps {
  vaultAddress: string;
  policies: Array<{ id: string; address: string; name: string }>;
  onProposalCreated?: () => void;
}

export default function CreateProposalWidget({ vaultAddress, policies, onProposalCreated }: CreateProposalWidgetProps) {
  const { provider, signer } = useWeb3();
  const [selectedPolicy, setSelectedPolicy] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [tokenAddress, setTokenAddress] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState<string>("");

  const handleSubmit = async () => {
    try {
      if (!signer) throw new Error("Wallet not connected");
      if (!selectedPolicy) throw new Error("Please select a policy");
      if (!amount || isNaN(Number(amount))) throw new Error("Please enter a valid amount");
      if (!tokenAddress) throw new Error("Please enter a target token address");

      setError(null);
      setStatus("Fetching Vault contract...");

      const vaultAbi = [
        "function proposalOpen(uint256 amount, address receiver, address owner, uint8 request, address token) external returns (uint256)"
      ];
      const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, signer);

      setStatus("Opening Proposal on-chain...");

      // Parse amount (assuming 18 decimals for simplicity, but could be adjusted based on token)
      const parsedAmount = ethers.parseUnits(amount, 18);
      
      // request = 0 is ProposalType.TXNS
      const tx = await vaultContract.proposalOpen(
        parsedAmount,
        selectedPolicy, // receiver is the policy
        await signer.getAddress(), // owner
        0, // ProposalType.TXNS
        tokenAddress // token being affected
      );

      setStatus("Waiting for confirmation...");
      const receipt = await tx.wait();
      
      // Need to parse ProposalOpen event to get proposalId
      // Fallback/simplification: since we don't have the exact ABI parsing here easily,
      // we'll rely on the API to link it or just use the TxHash for now.
      const txHash = receipt.hash;

      setStatus("Saving description off-chain...");
      await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          vaultAddress, 
          txHash, 
          description,
          tokenAddress,
          amount
        })
      });

      setStatus("Proposal created successfully!");
      if (onProposalCreated) {
        onProposalCreated();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to create proposal");
      setStatus("");
    }
  };

  return (
    <div className={`glass-card ${styles.widget}`}>
      <h2 className={styles.title}>Create a Proposal</h2>
      <p className={styles.subtitle}>Open a new proposal using an active Treasury Policy.</p>

      <div className={styles.form}>
        <div className={styles.field}>
          <label className="label">Select Policy *</label>
          <select 
            className="input" 
            value={selectedPolicy} 
            onChange={e => setSelectedPolicy(e.target.value)}
          >
            <option value="">-- Choose a policy --</option>
            {policies.map(p => (
              <option key={p.id} value={p.address}>
                {p.name} ({p.address.substring(0, 8)}...)
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className="label">Amount *</label>
          <input 
            className="input" 
            placeholder="0.0" 
            value={amount} 
            onChange={e => setAmount(e.target.value)} 
          />
        </div>

        <div className={styles.field}>
          <label className="label">Target Token (e.g., WETH) *</label>
          <input 
            className="input" 
            placeholder="0x..." 
            value={tokenAddress} 
            onChange={e => setTokenAddress(e.target.value)} 
          />
        </div>

        <div className={styles.field}>
          <label className="label">Proposal Rationale / Description *</label>
          <textarea 
            className="input" 
            placeholder="Why should this proposal be executed?" 
            value={description} 
            onChange={e => setDescription(e.target.value)}
            rows={4}
            style={{ resize: "vertical" }}
          />
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginTop: 10 }}>
            <span>⚠️ {error}</span>
          </div>
        )}

        {status && (
          <p className={styles.deployStatus} style={{ marginTop: 10, textAlign: "center" }}>{status}</p>
        )}

        <button
          className="btn btn-primary btn-lg"
          style={{ width: "100%", marginTop: 20 }}
          onClick={handleSubmit}
          disabled={!!status && status !== "Proposal created successfully!" && !error}
        >
          {status && status !== "Proposal created successfully!" && !error ? "Processing..." : "Submit Proposal"}
        </button>
      </div>
    </div>
  );
}
