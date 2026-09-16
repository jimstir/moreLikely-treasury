"use client";

import { useState } from "react";
import styles from "./CreateTreasuryGoalsForm.module.css";

interface Allocation {
  symbol: string;
  percentage: number;
}

interface CreateTreasuryGoalsFormProps {
  treasuryId: string;
  onSave?: (goals: any) => void;
}

export default function CreateTreasuryGoalsForm({ treasuryId, onSave }: CreateTreasuryGoalsFormProps) {
  const [allocations, setAllocations] = useState<Allocation[]>([
    { symbol: "USDC", percentage: 50 },
    { symbol: "WETH", percentage: 30 },
    { symbol: "WBTC", percentage: 20 },
  ]);
  const [slippageLimit, setSlippageLimit] = useState(0.5);
  const [stopLoss, setStopLoss] = useState(5.0);
  const [maxTradeSize, setMaxTradeSize] = useState(10.0);
  const [dataSources, setDataSources] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const totalAllocation = allocations.reduce((sum, a) => sum + a.percentage, 0);
  const isValidAllocation = totalAllocation === 100;

  const handleAllocationChange = (index: number, value: number) => {
    const newAllocations = [...allocations];
    newAllocations[index].percentage = value;
    setAllocations(newAllocations);
  };

  const addAllocation = () => {
    setAllocations([...allocations, { symbol: "", percentage: 0 }]);
  };

  const removeAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAllocation) return;
    
    setIsSubmitting(true);
    
        try {
      const payload = {
        treasuryId,
        documentType: "mandate",
        markdownContent: JSON.stringify({
          allocations,
          slippageLimit,
          stopLoss,
          maxTradeSize,
          dataSources: dataSources.split(",").map((s) => s.trim()).filter(Boolean),
        }),
        isPrivateOverride: false,
        signature: "0xPendingSignature", // TODO: Wire up useSignMessage hook
        signerAddress: "0xPendingAddress" // TODO: Wire up useAccount hook
      };

      const res = await fetch("/api/treasury/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to save goals");

      setSuccess(true);
      if (onSave) onSave(payload.markdownContent);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Failed to save goals.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`glass-card ${styles.formContainer}`}>
      <h2 style={{ marginBottom: 4 }}>Treasury Goals & Risk Policy</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: 14, marginBottom: 24 }}>
        Configure the AI agent's target portfolio allocation and risk parameters.
      </p>

      <form onSubmit={handleSubmit} className={styles.form}>
        {/* Allocations Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Target Allocations</h3>
            <span className={`badge ${isValidAllocation ? 'badge-success' : 'badge-danger'}`}>
              Total: {totalAllocation}%
            </span>
          </div>
          
          <div className={styles.allocationList}>
            {allocations.map((alloc, index) => (
              <div key={index} className={styles.allocationRow}>
                <input
                  type="text"
                  className="input"
                  placeholder="Token Symbol (e.g. USDC)"
                  value={alloc.symbol}
                  onChange={(e) => {
                    const newAlloc = [...allocations];
                    newAlloc[index].symbol = e.target.value.toUpperCase();
                    setAllocations(newAlloc);
                  }}
                  style={{ flex: 1 }}
                />
                <div className={styles.percentageInput}>
                  <input
                    type="number"
                    className="input"
                    value={alloc.percentage}
                    onChange={(e) => handleAllocationChange(index, Number(e.target.value))}
                    min="0"
                    max="100"
                  />
                  <span className={styles.percentSymbol}>%</span>
                </div>
                <button 
                  type="button" 
                  className={styles.removeBtn}
                  onClick={() => removeAllocation(index)}
                  disabled={allocations.length <= 1}
                >
                  ✕
                </button>
              </div>
            ))}
            
            <button 
              type="button" 
              className={styles.addBtn}
              onClick={addAllocation}
            >
              + Add Token Target
            </button>
          </div>
          
          {!isValidAllocation && (
            <p className={styles.errorText}>Total allocation must equal exactly 100%.</p>
          )}
        </div>

        {/* Risk Rules Section */}
        <div className={styles.section}>
          <h3 style={{ marginBottom: 16 }}>Risk Limits</h3>
          
          <div className="grid-3">
            <div className={styles.field}>
              <label className="label">Max Slippage (%)</label>
              <input 
                type="number" 
                className="input" 
                value={slippageLimit} 
                onChange={(e) => setSlippageLimit(Number(e.target.value))}
                step="0.1"
                min="0.1"
              />
              <p className={styles.fieldHint}>Maximum allowed price impact per trade.</p>
            </div>
            
            <div className={styles.field}>
              <label className="label">Stop-Loss (%)</label>
              <input 
                type="number" 
                className="input" 
                value={stopLoss} 
                onChange={(e) => setStopLoss(Number(e.target.value))}
                step="0.5"
                min="0"
              />
              <p className={styles.fieldHint}>Agent auto-sells if price drops below this.</p>
            </div>
            
            <div className={styles.field}>
              <label className="label">Max Trade Size (%)</label>
              <input 
                type="number" 
                className="input" 
                value={maxTradeSize} 
                onChange={(e) => setMaxTradeSize(Number(e.target.value))}
                step="1"
                min="1"
                max="100"
              />
              <p className={styles.fieldHint}>Max % of TVL allowed in a single transaction.</p>
            </div>
          </div>
        </div>

        {/* Data Sources Section */}
        <div className={styles.section}>
          <h3 style={{ marginBottom: 16 }}>Approved Data Sources</h3>
          <div className={styles.field}>
            <label className="label">Web Feeds & APIs (Comma separated URLs)</label>
            <textarea
              className={`input ${styles.textarea}`}
              placeholder="https://api.coingecko.com/v3/..., https://news.google.com/..."
              value={dataSources}
              onChange={(e) => setDataSources(e.target.value)}
            />
            <p className={styles.fieldHint}>
              The AI Governor will only trust information retrieved from these whitelisted domains during evaluation.
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <button 
            type="submit" 
            className="btn btn-primary btn-lg" 
            disabled={!isValidAllocation || isSubmitting}
            style={{ minWidth: 200 }}
          >
            {isSubmitting ? "Saving..." : success ? "Saved Successfully!" : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}
