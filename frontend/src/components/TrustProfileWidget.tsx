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
  aiOverlay?: any[];
  overallMaliciousProbability?: number;
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
              aiOverlay: data.aiOverlay as any[],
              overallMaliciousProbability: data.overallScore, // We store probability in overallScore
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
        aiOverlay: updatedData.profile.aiOverlay,
        overallMaliciousProbability: updatedData.overallMaliciousProbability,
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

  
  const isAlertTriggered = profile.overallMaliciousProbability !== undefined && profile.overallMaliciousProbability > 0;

  return (
    <div className={`glass-card ${styles.container}`}>
      <div className={styles.topControls}>
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

      <div className={styles.header} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {isAlertTriggered ? (
          <div style={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', border: '1px solid #f87171', padding: '16px', borderRadius: '8px', width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#f87171', margin: '0 0 8px 0' }}>⚠️ Master Alert: Review Required</h2>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Overall Probability of Malicious Intent: {profile.overallMaliciousProbability}%</p>
          </div>
        ) : (
           <div style={{ backgroundColor: 'rgba(74, 222, 128, 0.1)', border: '1px solid #4ade80', padding: '16px', borderRadius: '8px', width: '100%', textAlign: 'center' }}>
            <h2 style={{ color: '#4ade80', margin: '0 0 8px 0' }}>✅ No Malicious Intent Detected</h2>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Overall Probability of Malicious Intent: 0%</p>
          </div>
        )}
      </div>

      {isAlertTriggered && profile.aiOverlay && (
        <div className={styles.attributeList} style={{ marginTop: '24px' }}>
          <h3 style={{ marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>Triggered Attributes</h3>
          {profile.aiOverlay.filter(a => a.isTriggered).map((attr, idx) => (
            <div key={idx} className={styles.attributeRow} style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '8px', marginBottom: '12px' }}>
              <div className={styles.attrBody}>
                <div className={styles.attrTop}>
                  <span className={styles.attrTitle} style={{ color: '#fbbf24', fontSize: '16px', fontWeight: 'bold' }}>{attr.attributeName}</span>
                </div>
                <div className={styles.aiRationaleBox} style={{ marginTop: '8px', borderLeft: '3px solid #fbbf24', paddingLeft: '12px', color: '#eee' }}>
                  {attr.triggerDescription}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.footer} style={{ marginTop: '24px', textAlign: 'center' }}>
        <span className={styles.footerNote}>Last computed: {new Date(profile.computedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
