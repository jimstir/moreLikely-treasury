"use client";

import { useState } from "react";
import styles from "../GovernorControlPanel.module.css";

interface LendingStrategyEditorProps {
  treasuryId: string;
  initialContent?: string;
}

export default function LendingStrategyEditor({ treasuryId, initialContent = "" }: LendingStrategyEditorProps) {
  const [content, setContent] = useState(initialContent || "1. Monitor health factor of all loans.\n2. If health factor < 1.05, immediately call seizeCollateral().");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/treasury/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryId,
          documentType: "lending-strategies",
          content,
          isPrivate: false // Default to public for lending rules
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
      <h3 style={{ marginBottom: 8 }}>Lending Strategy (AI Policy)</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 16 }}>
        Define the liquidation thresholds and monitoring instructions for the AI to protect against bad debt.
      </p>

      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 24 }}>
          <label className="label">Custom Markdown Instructions</label>
          <textarea 
            className="input" 
            style={{ minHeight: 200, fontFamily: "monospace", width: "100%", padding: 12 }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your AI liquidation rules here..."
          />
        </div>

        <button 
          type="submit" 
          className="btn btn-primary" 
          disabled={isSubmitting || !content.trim()}
          style={{ width: "100%" }}
        >
          {isSubmitting ? "Uploading to Storage..." : success ? "✓ Saved & Signed" : "Save Lending Strategy"}
        </button>
      </form>
    </div>
  );
}
