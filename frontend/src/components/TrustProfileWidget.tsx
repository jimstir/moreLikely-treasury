"use client";

import React, { useEffect, useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { computeTrustProfile, TrustProfileResult, AttributeResult } from "@/lib/trust-profile";
import styles from "./TrustProfileWidget.module.css";

interface TrustProfileWidgetProps {
  treasuryId: string;
  vaultAddress: string;
  userAddress: string;
}

export default function TrustProfileWidget({ treasuryId, vaultAddress, userAddress }: TrustProfileWidgetProps) {
  const { provider } = useWeb3();
  const [profile, setProfile] = useState<TrustProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
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
            });
          }
        }
      } catch (err) {
        console.error("Failed to load trust profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [treasuryId, userAddress]);

  const handleGenerate = async () => {
    if (!provider) {
      setError("Please connect your wallet to generate the trust profile (needs on-chain reads).");
      return;
    }
    setComputing(true);
    setError(null);
    try {
      // 1. Compute trust profile via on-chain reads
      const result = await computeTrustProfile({
        vaultAddress,
        provider,
        // In a real app, these would be fetched from the treasury configuration/DB
        // swapPolicyAddress: "0x...",
        // lendingPolicyAddress: "0x...",
      });

      // 2. Save to DB
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

      if (!res.ok) {
        throw new Error("Failed to save trust profile to database.");
      }

      setProfile(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while generating the profile.");
    } finally {
      setComputing(false);
    }
  };

  const getSeverityColor = (sev: string) => {
    if (sev === "safe") return "#4ade80"; // green-400
    if (sev === "warning") return "#fbbf24"; // amber-400
    return "#f87171"; // red-400
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: 40, textAlign: "center", color: "#aaa" }}>
        <div className={styles.spinner} style={{ margin: "0 auto 16px" }} />
        Checking profile status...
      </div>
    );
  }

  // Not generated yet
  if (!profile) {
    return (
      <div className={styles.ctaCard}>
        <div className={styles.ctaIcon}>🛡️</div>
        <h3>Trust Profile Not Generated</h3>
        <p>
          Each user must explicitly request a trust profile for a treasury. 
          Generating it will audit on-chain governance metrics, token addition controls, 
          and AI agent security paths.
        </p>
        <button 
          className="btn btn-primary" 
          onClick={handleGenerate} 
          disabled={computing || !provider}
          style={{ marginTop: 12, minWidth: 200 }}
        >
          {computing ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
              <span className={styles.spinner} /> Auditing...
            </span>
          ) : (
            "Generate Trust Profile"
          )}
        </button>
        {error && <div style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  // Render the Profile
  return (
    <div className={`glass-card ${styles.container}`}>
      {/* Header */}
      <div className={styles.header}>
        {/* Ring Gauge */}
        <div className={styles.ringWrap}>
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle 
              cx="55" cy="55" r="48" 
              fill="none" 
              stroke="rgba(255,255,255,0.08)" 
              strokeWidth="10" 
            />
            <circle 
              cx="55" cy="55" r="48" 
              fill="none" 
              stroke={profile.overallScore >= 80 ? "#4ade80" : profile.overallScore >= 50 ? "#fbbf24" : "#f87171"} 
              strokeWidth="10" 
              strokeDasharray="301.59" 
              strokeDashoffset={301.59 - (301.59 * profile.overallScore) / 100}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className={styles.ringLabel}>
            <span className={styles.ringScore}>{profile.overallScore}</span>
            <span className={styles.ringCaption}>Trust Score</span>
          </div>
        </div>

        <div className={styles.titleBlock}>
          <h2>Governance & Security Audit</h2>
          <p>
            This treasury has been audited against the 7 standardized trust metrics. 
            Scores reflect the degree of centralization risk and default exposure.
          </p>
        </div>

        <div>
          <button 
            className="btn btn-secondary" 
            onClick={handleGenerate} 
            disabled={computing}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {computing ? "Refreshing..." : "↻ Refresh Audit"}
          </button>
        </div>
      </div>

      {/* Attribute List */}
      <div className={styles.attributeList}>
        {profile.attributes.map((attr) => (
          <div key={attr.id} className={styles.attributeRow}>
            <div className={styles.attrIndex}>{attr.id}</div>
            
            <div className={styles.attrBody}>
              <div className={styles.attrTop}>
                <span className={styles.attrTitle}>{attr.title}</span>
                <span className={`${styles.badge} ${styles[attr.severity]}`}>
                  {attr.severity}
                </span>
              </div>
              <div className={styles.attrDetail}>{attr.detail}</div>
              {attr.rawValue && (
                <div className={styles.attrRaw}>{attr.rawValue}</div>
              )}
            </div>

            {/* Score visualizer */}
            <div className={styles.attrScoreBar}>
              <div className={styles.attrScoreNum} style={{ color: getSeverityColor(attr.severity) }}>
                {attr.score}
              </div>
              <div className={styles.attrScoreTrack}>
                <div 
                  className={styles.attrScoreFill} 
                  style={{ 
                    height: `${attr.score}%`,
                    backgroundColor: getSeverityColor(attr.severity) 
                  }} 
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span className={styles.footerNote}>
          Last audited: {new Date(profile.computedAt).toLocaleString()}
        </span>
        <span className={styles.footerNote}>
          Data sourced on-chain via Web3 Provider
        </span>
      </div>
    </div>
  );
}
