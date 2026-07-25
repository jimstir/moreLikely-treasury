"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/context/Web3Context";
import { getTreasuryVault } from "@/lib/contracts";
import styles from "./ProposalQueue.module.css";
import VotingInterface from "./VotingInterface";

interface Proposal {
  id: number;
  amount: string;
  policy: string;
  receiver: string;
  token: string;
  isClosed: boolean;
  isExecuted: boolean;
  isVault: boolean;
  type: string; // "Trade", "Withdraw", "Config"
}

interface ProposalQueueProps {
  vaultAddress: string;
}

export default function ProposalQueue({ vaultAddress }: ProposalQueueProps) {
  const { provider } = useWeb3();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null);

  useEffect(() => {
    if (!provider) return;

    const fetchProposals = async () => {
      try {
        const vault = getTreasuryVault(vaultAddress, provider);
        const countBigInt = await vault.proposalCount();
        const count = Number(countBigInt);
        
        const fetchedProposals: Proposal[] = [];
        
        // Fetch proposals in reverse order (newest first)
        for (let i = count; i > 0; i--) {
          const [amount, policy, receiver, token, isClosed, isExecuted, isVault] = await Promise.all([
            vault.proposalAmount(i),
            vault.proposalPolicy(i),
            vault.proposalReceiver(i),
            vault.proposalToken(i),
            vault.closedProposal(i),
            vault.executed(i),
            vault.isVault(i),
          ]);
          
          let type = "Standard";
          if (isVault) type = "Deposit/Withdraw";
          else if (policy !== ethers.ZeroAddress) type = "AI Trade Policy";

          fetchedProposals.push({
            id: i,
            amount: ethers.formatEther(amount),
            policy,
            receiver,
            token,
            isClosed,
            isExecuted,
            isVault,
            type,
          });
        }
        
        setProposals(fetchedProposals);
      } catch (err) {
        console.error("Failed to fetch proposals:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProposals();
  }, [provider, vaultAddress]);

  if (loading) {
    return (
      <div className="glass-card">
        <h3>Governance Queue</h3>
        <div className="skeleton" style={{ width: "100%", height: 80, marginTop: 16 }} />
        <div className="skeleton" style={{ width: "100%", height: 80, marginTop: 12 }} />
      </div>
    );
  }

  const getStatusBadge = (p: Proposal) => {
    if (p.isExecuted) return <span className="badge badge-success">Executed</span>;
    if (p.isClosed) return <span className="badge badge-warning">Closed</span>;
    return <span className="badge badge-info">Active</span>;
  };

  return (
    <div className={`glass-card ${styles.container}`}>
      <div className={styles.header}>
        <h3>Governance Queue</h3>
        <button className="btn btn-secondary btn-sm">Filter: All</button>
      </div>

      {proposals.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No proposals have been opened yet.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {proposals.map((p) => (
            <div 
              key={p.id} 
              className={`${styles.proposalCard} ${selectedProposalId === p.id ? styles.selected : ''}`}
              onClick={() => setSelectedProposalId(selectedProposalId === p.id ? null : p.id)}
            >
              <div className={styles.cardHeader}>
                <div className={styles.titleGroup}>
                  <span className={styles.id}>#{p.id}</span>
                  <span className={styles.type}>{p.type}</span>
                </div>
                {getStatusBadge(p)}
              </div>
              
              <div className={styles.detailsGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.label}>Amount</span>
                  <span className={styles.value}>{parseFloat(p.amount).toFixed(4)}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.label}>Token</span>
                  <span className={styles.monoValue}>{p.token.slice(0, 6)}…{p.token.slice(-4)}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.label}>Receiver/Policy</span>
                  <span className={styles.monoValue}>
                    {p.policy !== ethers.ZeroAddress 
                      ? `${p.policy.slice(0, 6)}…${p.policy.slice(-4)}`
                      : `${p.receiver.slice(0, 6)}…${p.receiver.slice(-4)}`
                    }
                  </span>
                </div>
              </div>

              {selectedProposalId === p.id && !p.isClosed && !p.isExecuted && (
                <div className={styles.votingSection} onClick={(e) => e.stopPropagation()}>
                  <VotingInterface proposalId={p.id} vaultAddress={vaultAddress} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
