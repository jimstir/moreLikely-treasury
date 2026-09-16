"use client";

import { useState } from "react";
import styles from "../GovernorControlPanel.module.css";

interface TrustProfileCheckpointsEditorProps {
  treasuryId: string;
  userAddress: string;
  initialCheckpoints?: string;
}

export default function TrustProfileCheckpointsEditor({ treasuryId, userAddress, initialCheckpoints = "" }: TrustProfileCheckpointsEditorProps) {
  const [content, setContent] = useState(initialCheckpoints || "1. Check Owner Override...\n2. Check Token Control...");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // NOTE: This hits a user-specific API, not the global treasury API.
      // Saving to the user's TrustProfile database row to keep their audit rules personal.
      const res = await fetch("/api/trust-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryId,
          walletAddress: userAddress,
          customCheckpointsDocument: content,
        }),
      });

      if (!res.ok) throw new Error("Failed to save personal checkpoints.");

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save. Check console for details.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
      {/* Editor Section */}
      <div className={`glass-card`} style={{ padding: 24, flex: 2 }}>
        <h3 style={{ marginBottom: 8 }}>Customize Trust Checkpoints</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
          Modify the community-default audit checkpoints. The AI will evaluate the treasury based on your personal instructions here.
        </p>

        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 24 }}>
            <textarea 
              className="input" 
              style={{ minHeight: 300, fontFamily: "monospace", width: "100%", padding: 12 }}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. 9. Flag if the owner swaps more than 10 times a day."
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={isSubmitting || !content.trim()}
            style={{ width: "100%" }}
          >
            {isSubmitting ? "Uploading Personal Config..." : success ? "✓ Saved" : "Save Personal Checkpoints"}
          </button>
        </form>
      </div>

      {/* Data Dictionary Sidebar */}
      <div className={`glass-card`} style={{ padding: 24, flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }}>
        <h4 style={{ marginBottom: 12, color: "var(--color-primary)" }}>Available Variables</h4>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
          Use these variables when writing custom checkpoints to ensure the AI has the exact blockchain data to answer you.
        </p>

        <ul style={{ fontSize: 12, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <li><strong>hasBeenTradedBeforeApproval</strong>: Catches front-running token additions.</li>
          <li><strong>totalSwapBacksExecuted</strong>: Count of portfolio rebalancing trades.</li>
          <li><strong>timeSpentInDefaultWarningSeconds</strong>: Time it takes to liquidate bad debt.</li>
          <li><strong>passedUnilaterallyByOwner</strong>: Flags if a proposal passed via centralized voting power.</li>
          <li><strong>marketSnapshotAtClosure</strong>: Proves if the market was crashing during a manual intervention.</li>
        </ul>
      </div>
    </div>
  );
}
