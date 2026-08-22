"use client";

import React, { useEffect, useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { computeTrustProfile, TrustProfileResult, AttributeResult } from "@/lib/trust-profile";
import { AIOverlayResult } from "@/lib/ai-agent";
import styles from "./TrustProfileWidget.module.css";

interface TrustProfileWidgetProps {
  treasuryId: string;
  vaultAddress: string;
  userAddress: string;
}

interface DBProfile extends TrustProfileResult {
  aiOverlay?: AIOverlayResult[];
  isAutoRenewing?: boolean;
}

export default function TrustProfileWidget({ treasuryId, vaultAddress, userAddress }: TrustProfileWidgetProps) {
  const { provider } = useWeb3();
  const [profile, setProfile] = useState<DBProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing profile from DB
  useEffect(() => {
    async function loadProfile() {
      if (!userAddress) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/trust-profile?treasuryId=${treasuryId}&walletAddress=${userAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.scores) {
            setProfile({
              overallScore: data.overallScore,
              attributes: data.scores as AttributeResult[],
              computedAt: new Date(data.lastComputedAt).getTime(),
              aiOverlay: data.aiOverlay as AIOverlayResult[],
              isAutoRenewing: data.isAutoRenewing,
            });
            
            // Auto-audit logic
            if (data.isAutoRenewing) {
              const hoursSince = (Date.now() - new Date(data.lastComputedAt).getTime()) / (1000 * 60 * 60);
              if (hoursSince > 24) {
                // Background refresh if older than 24h
                handleAiAudit();
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load trust profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treasuryId, userAddress]);

  const handleGenerate = async () => {
    if (!provider) {
      setError("Please connect your wallet to generate the trust profile (needs on-chain reads).");
      return;
    }
    setComputing(true);
    setError(null);
    try {
      const result = await computeTrustProfile({
        vaultAddress,
        provider,
      });

      const res = await fetch("/api/trust-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryId,
          walletAddress: userAddress,
          overallScore: result.overallScore,
          scores: result.attributes,
        }),
      });

      if (!res.ok) throw new Error("Failed to save trust profile to database.");

      setProfile(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while generating the profile.");
    } finally {
      setComputing(false);
    }
  };

  const handleAiAudit = async () => {
    setAuditing(true);
    setError(null);
    try {
      const res = await fetch("/api/trust-profile/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treasuryId, walletAddress: userAddress }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "AI Audit failed.");
      }

      const updatedData = await res.json();
      setProfile((prev) => prev ? {
        ...prev,
        aiOverlay: updatedData.aiOverlay,
        computedAt: new Date(updatedData.lastComputedAt).getTime(),
      } : null);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setAuditing(false);
    }
  };

  const toggleAutoRenew = async () => {
    if (!profile) return;
    const newState = !profile.isAutoRenewing;
    setProfile({ ...profile, isAutoRenewing: newState });
    
    try {
      await fetch("/api/trust-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryId,
          walletAddress: userAddress,
          isAutoRenewing: newState,
        }),
      });
    } catch (err) {
      console.error("Failed to toggle auto-renew:", err);
      // Revert state on fail
      setProfile({ ...profile, isAutoRenewing: !newState });
    }
  };

  const getSeverityColor = (sev: string) => {
    if (sev === "safe") return "#4ade80";
    if (sev === "warning") return "#fbbf24";
    return "#f87171";
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 40, textAlign: "center", color: "#aaa" }}>
        <div className={styles.spinner} style={{ margin: "0 auto 16px" }} />
        Checking profile status...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.ctaCard}>
        <div className={styles.ctaIcon}>🛡️</div>
        <h3>Trust Profile Not Generated</h3>
        <p>Each user must explicitly request a trust profile for a treasury.</p>
        <button 
          className="btn btn-primary" 
          onClick={handleGenerate} 
          disabled={computing || !provider}
          style={{ marginTop: 12, minWidth: 200 }}
        >
          {computing ? <span className={styles.spinner} /> : "Generate Trust Profile"}
        </button>
        {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className={`glass-card ${styles.container}`}>
      {/* Top Controls: Auto Renew */}
      <div className={styles.topControls}>
        <label className={styles.toggleWrap}>
          <input 
            type="checkbox" 
            checked={!!profile.isAutoRenewing} 
            onChange={toggleAutoRenew} 
          />
          <span className={styles.toggleSlider}></span>
          <span style={{ fontSize: 13 }}>Auto-Renew & Audit (Subscription Required)</span>
        </label>
        <button 
          className="btn btn-primary" 
          onClick={handleAiAudit} 
          disabled={auditing}
          style={{ padding: "6px 14px", fontSize: 12 }}
        >
          {auditing ? "🤖 Auditing..." : "🤖 Run AI Audit"}
        </button>
      </div>
      
      {error && <div style={{ color: "#f87171", fontSize: 13, padding: "0 20px" }}>{error}</div>}

      <div className={styles.header}>
        <div className={styles.ringWrap}>
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r="48" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
            <circle 
              cx="55" cy="55" r="48" fill="none" 
              stroke={profile.overallScore >= 80 ? "#4ade80" : profile.overallScore >= 50 ? "#fbbf24" : "#f87171"} 
              strokeWidth="10" strokeDasharray="301.59" 
              strokeDashoffset={301.59 - (301.59 * profile.overallScore) / 100}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className={styles.ringLabel}>
            <span className={styles.ringScore}>{profile.overallScore}</span>
            <span className={styles.ringCaption}>Score</span>
          </div>
        </div>
        <div className={styles.titleBlock}>
          <h2>Governance & Security Audit</h2>
          <p>Layer 1 deterministic metrics combined with Layer 2 AI Contextual Overlay.</p>
        </div>
      </div>

      <div className={styles.attributeList}>
        {profile.attributes.map((attr) => {
          const aiContext = profile.aiOverlay?.find(a => a.attributeId === attr.id);
          const currentSeverity = aiContext ? aiContext.revisedSeverity : attr.severity;
          
          return (
            <div key={attr.id} className={styles.attributeRow}>
              <div className={styles.attrIndex}>{attr.id}</div>
              
              <div className={styles.attrBody}>
                <div className={styles.attrTop}>
                  <span className={styles.attrTitle}>{attr.title}</span>
                  {aiContext && aiContext.revisedSeverity !== attr.severity && (
                     <span style={{ fontSize: 11, color: '#aaa', textDecoration: 'line-through', marginRight: 8 }}>
                       {attr.severity}
                     </span>
                  )}
                  <span className={`${styles.badge} ${styles[currentSeverity]}`}>
                    {currentSeverity}
                  </span>
                  {aiContext && <span className={styles.aiBadge}>🤖 AI Analyzed</span>}
                </div>
                <div className={styles.attrDetail}>{attr.detail}</div>
                {attr.rawValue && <div className={styles.attrRaw}>{attr.rawValue}</div>}
                
                {aiContext && (
                  <div className={styles.aiRationaleBox}>
                    <strong>AI Rationale:</strong> {aiContext.aiRationale}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerNote}>Last computed: {new Date(profile.computedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
