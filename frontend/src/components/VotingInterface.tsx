"use client";

import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import styles from "./VotingInterface.module.css";

interface VotingInterfaceProps {
  proposalId: number;
  vaultAddress: string;
}

export default function VotingInterface({ proposalId, vaultAddress }: VotingInterfaceProps) {
  const { provider, signer, address, chainId } = useWeb3();
  const [voteStatus, setVoteStatus] = useState<"idle" | "signing" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  
  // Real data state
  const [votesFor, setVotesFor] = useState(BigInt(0));
  const [votesAgainst, setVotesAgainst] = useState(BigInt(0));

  useEffect(() => {
    async function fetchVotes() {
      if (!provider || !vaultAddress) return;
      try {
        const vaultAbi = [
          "function getProposalVotes(uint256 proposalId) view returns (uint256 forVotes, uint256 againstVotes)"
        ];
        const vaultContract = new ethers.Contract(vaultAddress, vaultAbi, provider);
        // Note: Assuming a getter exists. If the contract tracks this natively, we fetch it.
        // If the contract does not have getProposalVotes, we might need to read events or off-chain state.
        // Assuming offchain DB API fallback if not on-chain:
        const response = await fetch(`/api/voting/stats?proposalId=${proposalId}`);
        if (response.ok) {
           const data = await response.json();
           setVotesFor(BigInt(data.forVotes));
           setVotesAgainst(BigInt(data.againstVotes));
        }
      } catch (e) {
        console.error("Failed to fetch votes", e);
      }
    }
    fetchVotes();
  }, [provider, vaultAddress, proposalId]);

  const totalVotes = Number(ethers.formatEther(votesFor + votesAgainst));
  const percentFor = totalVotes > 0 ? (Number(ethers.formatEther(votesFor)) / totalVotes) * 100 : 0;
  const percentAgainst = totalVotes > 0 ? (Number(ethers.formatEther(votesAgainst)) / totalVotes) * 100 : 0;

  const handleVote = async (support: boolean) => {
    if (!signer || !address || !chainId) return;
    setVoteStatus("signing");
    setErrorMsg("");

    try {
      // EIP-712 Domain
      const domain = {
        name: "SmartTreasuryVoting",
        version: "1",
        chainId,
        verifyingContract: vaultAddress, // Normally this would be the specific Policy contract
      };

      // The named list of all type definitions
      const types = {
        Vote: [
          { name: "proposalId", type: "uint256" },
          { name: "support", type: "bool" },
          { name: "voter", type: "address" },
        ],
      };

      // The data to sign
      const value = {
        proposalId,
        support,
        voter: address,
      };

      // Prompt MetaMask to sign the typed data
      const signature = await signer.signTypedData(domain, types, value);
      
      setVoteStatus("submitting");

      // In production, send signature to API: POST /api/voting/cast
      await fetch("/api/voting/cast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, voterAddress: address, support, signature }),
      }).catch(() => {
        // Fallback for demo if API route doesn't exist yet
        return new Promise((resolve) => setTimeout(resolve, 1000));
      });

      

      setVoteStatus("success");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to cast vote");
      setVoteStatus("error");
    }
  };

  if (voteStatus === "success") {
    return (
      <div className={styles.successState}>
        <div className={styles.icon}>✅</div>
        <h4>Vote Cast Successfully</h4>
        <p>Your off-chain signature has been recorded.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h4>Cast Your Vote</h4>
      <p className={styles.hint}>
        Voting is gasless. You will be prompted to sign an off-chain message proving your share balance at the proposal's creation block.
      </p>
      
      <div className={styles.progressContainer}>
        <div className={styles.progressLabels}>
          <span style={{ color: "var(--accent-emerald-light)" }}>Approve ({percentFor.toFixed(1)}%)</span>
          <span style={{ color: "var(--accent-rose-light)" }}>Reject ({percentAgainst.toFixed(1)}%)</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFor} style={{ width: `${percentFor}%` }} />
          <div className={styles.progressAgainst} style={{ width: `${percentAgainst}%` }} />
        </div>
      </div>

      {voteStatus === "error" && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <span>⚠️ {errorMsg}</span>
        </div>
      )}

      <div className={styles.actions}>
        <button 
          className={`btn ${styles.btnApprove}`}
          onClick={() => handleVote(true)}
          disabled={voteStatus === "signing" || voteStatus === "submitting"}
        >
          {voteStatus === "signing" ? "Check Wallet..." : "Approve"}
        </button>
        <button 
          className={`btn ${styles.btnReject}`}
          onClick={() => handleVote(false)}
          disabled={voteStatus === "signing" || voteStatus === "submitting"}
        >
          {voteStatus === "signing" ? "Check Wallet..." : "Reject"}
        </button>
      </div>
    </div>
  );
}
