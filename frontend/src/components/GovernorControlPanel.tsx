"use client";

import { useState } from "react";
import styles from "./GovernorControlPanel.module.css";
import CreateTreasuryGoalsForm from "./CreateTreasuryGoalsForm";
import { useWeb3 } from "@/context/Web3Context";

interface GovernorControlPanelProps {
  treasuryId: string;
}

export default function GovernorControlPanel({ treasuryId }: GovernorControlPanelProps) {
  const { isOwner } = useWeb3();
  const [governorMode, setGovernorMode] = useState<"manual" | "ai">("manual");
  const [showConfig, setShowConfig] = useState(false);
  const [gasAllowance, setGasAllowance] = useState("0.1");
  const [agentStatus, setAgentStatus] = useState<"offline" | "deploying" | "active">("offline");

  const handleDeployAgent = () => {
    setAgentStatus("deploying");
    
    // Simulate deployment to 0G Network
    setTimeout(() => {
      setAgentStatus("active");
      setGovernorMode("ai");
      setShowConfig(false);
    }, 2500);
  };

  if (!isOwner) {
    return (
      <div className={`glass-card ${styles.container}`}>
        <h3>Governance Control</h3>
        <div className="alert alert-info" style={{ marginTop: 16 }}>
          <span>ℹ️ Only the treasury owner/operator can configure the AI Governor.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`glass-card ${styles.container}`}>
      <div className={styles.header}>
        <div>
          <h3>Governance Control</h3>
          <p className={styles.subtitle}>Manage how trade proposals are generated.</p>
        </div>
        
        <div className={styles.modeToggle}>
          <button 
            className={`${styles.toggleBtn} ${governorMode === "manual" ? styles.active : ""}`}
            onClick={() => {
              if (agentStatus === "active") setAgentStatus("offline");
              setGovernorMode("manual");
            }}
          >
            Manual
          </button>
          <button 
            className={`${styles.toggleBtn} ${governorMode === "ai" ? styles.activeAI : ""}`}
            onClick={() => {
              if (agentStatus === "offline") setShowConfig(true);
              else setGovernorMode("ai");
            }}
          >
            <span className={styles.sparkle}>✨</span> AI Governor
          </button>
        </div>
      </div>

      {governorMode === "manual" && !showConfig && (
        <div className={styles.manualModeInfo}>
          <div className={styles.iconWrapper}>👤</div>
          <h4>Manual Mode Active</h4>
          <p>
            You are responsible for manually evaluating market conditions and creating proposals.
            The AI Agent is currently offline.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 16 }}>
            Create Manual Proposal
          </button>
        </div>
      )}

      {showConfig && (
        <div className={styles.configOverlay}>
          <div className={styles.configHeader}>
            <h4>Initialize 0G AI Governor</h4>
            <button className={styles.closeBtn} onClick={() => setShowConfig(false)}>✕</button>
          </div>
          
          <div className={styles.configContent}>
            <div className={styles.agentProvisioning}>
              <h5>1. Provision Agent Wallet</h5>
              <p className={styles.hint}>
                The agent requires a funded EOA on Sepolia to pay for gas when broadcasting attestations.
              </p>
              
              <div className={styles.field} style={{ marginTop: 12 }}>
                <label className="label">Gas Allowance (ETH)</label>
                <input 
                  type="number" 
                  className="input" 
                  value={gasAllowance}
                  onChange={(e) => setGasAllowance(e.target.value)}
                  step="0.05"
                  min="0.01"
                />
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <h5>2. Define Policy</h5>
              <div style={{ marginTop: 12, border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
                <CreateTreasuryGoalsForm treasuryId={treasuryId} onSave={() => {}} />
              </div>
            </div>
            
            <div className={styles.deployAction}>
              {agentStatus === "deploying" ? (
                <button className="btn btn-primary btn-lg" disabled style={{ width: "100%" }}>
                  <div className={styles.spinner} style={{ marginRight: 8 }} />
                  Deploying to 0G Compute Network...
                </button>
              ) : (
                <button 
                  className="btn btn-primary btn-lg" 
                  onClick={handleDeployAgent}
                  style={{ width: "100%", background: "var(--gradient-accent)" }}
                >
                  <span style={{ marginRight: 8 }}>🚀</span>
                  Deploy AI Agent
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {governorMode === "ai" && agentStatus === "active" && !showConfig && (
        <div className={styles.aiModeActive}>
          <div className={styles.aiStatusHeader}>
            <div className={styles.agentAvatar}>🤖</div>
            <div className={styles.agentInfo}>
              <h4>Autonomous Agent Active</h4>
              <div className={styles.statusBadge}>
                <span className={styles.pulseDot}></span>
                Monitoring Markets on 0G
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowConfig(true)}>
              Edit Policy
            </button>
          </div>
          
          <div className={styles.agentStatsGrid}>
            <div className={styles.statBox}>
              <span className="stat-label">Last Evaluation</span>
              <span className={styles.statVal}>2 mins ago</span>
            </div>
            <div className={styles.statBox}>
              <span className="stat-label">Proposals Created</span>
              <span className={styles.statVal}>12</span>
            </div>
            <div className={styles.statBox}>
              <span className="stat-label">Gas Remaining</span>
              <span className={styles.statVal}>0.08 ETH</span>
            </div>
          </div>
          
          <div className={styles.actionLog}>
            <h5 style={{ marginBottom: 12, color: "var(--text-secondary)" }}>Recent Activity Logs</h5>
            <div className={styles.logItem}>
              <span className={styles.logTime}>10:42 AM</span>
              <span className={styles.logMsg}>Evaluated WETH/USDC liquidity. No action taken (within policy).</span>
            </div>
            <div className={styles.logItem}>
              <span className={styles.logTime}>09:15 AM</span>
              <span className={styles.logMsg}>Attested Voting Results for Proposal #14.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
