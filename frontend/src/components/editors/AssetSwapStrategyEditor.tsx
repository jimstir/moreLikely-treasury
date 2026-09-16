"use client";

import { useState } from "react";
import styles from "../GovernorControlPanel.module.css";

interface AssetSwapStrategyEditorProps {
  treasuryId: string;
  initialContent?: string;
}

export default function AssetSwapStrategyEditor({ treasuryId, initialContent = "" }: AssetSwapStrategyEditorProps) {
  const [content, setContent] = useState(initialContent || "1. Review portfolio allocations against mandate...\n2. Execute swap if deviation > 5%...");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      // Send to the unified document creation API endpoint
      const res = await fetch("/api/treasury/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryId,
          documentType: "asset-swap-strategies",
          content,
          isPrivate
        }),
      });

      if (!res.ok) throw new Error("Failed to save strategy document.");

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
    <div className={`glass-card`} style={{ padding: 24, marginTop: 16 }}>
      <h3 style={{ marginBottom: 8 }}>Asset Swap Strategy (AI Policy)</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
        Define the exact rules the AI Governor uses to trade assets. Modify the default open-source template to fit your goals.
      </p>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 16 }}>
          <label className="label">Custom Markdown Instructions</label>
          <textarea 
            className="input" 
            style={{ minHeight: 200, fontFamily: "monospace", width: "100%", padding: 12 }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your AI execution rules here..."
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
          <div>
            <h4 style={{ fontSize: 15, marginBottom: 4 }}>Visibility Settings</h4>
            <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>
              {isPrivate ? "Trading Secrets active. Only the AI and you can read this policy." : "Open Source. Stakeholders can audit this policy."}
            </p>
          </div>
          
          <label className={styles.toggleWrap}>
            <input 
              type="checkbox" 
              checked={isPrivate} 
              onChange={() => setIsPrivate(!isPrivate)} 
            />
            <span className={styles.toggleSlider}></span>
            <span style={{ fontSize: 13, marginLeft: 8 }}>Make Private</span>
          </label>
        </div>

        <button 
          type="submit" 
          className="btn btn-primary" 
          disabled={isSubmitting || !content.trim()}
          style={{ width: "100%" }}
        >
          {isSubmitting ? "Uploading to Storage..." : success ? "✓ Saved & Signed" : "Save Strategy"}
        </button>
      </form>
    </div>
  );
}
