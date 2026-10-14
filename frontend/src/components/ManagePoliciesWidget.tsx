import React, { useState } from 'react';

export default function ManagePoliciesWidget({ treasuryId }: { treasuryId: string }) {
  const [policyAddress, setPolicyAddress] = useState('');
  const [policyType, setPolicyType] = useState('AssetSwapPolicy');
  const [status, setStatus] = useState('');

  const attachPolicy = async () => {
    setStatus("Attaching policy...");
    try {
      const res = await fetch("/api/treasury/policies/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          treasuryId,
          policies: [{ address: policyAddress, type: policyType }]
        })
      });
      if (res.ok) {
        setStatus("Policy attached successfully! Badges updated.");
      } else {
        setStatus("Failed to attach policy.");
      }
    } catch (e) {
      setStatus("Error attaching policy.");
    }
  }

  return (
    <div className="glass-card" style={{ padding: '20px', marginTop: '20px' }}>
      <h3>Manage Attached Policies</h3>
      <p style={{fontSize: '14px', color: 'gray'}}>Attach existing policies to dynamically upgrade your treasury's use-case badge.</p>
      
      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
        <input 
          type="text" 
          placeholder="0x..." 
          className="form-control"
          value={policyAddress}
          onChange={(e) => setPolicyAddress(e.target.value)}
        />
        <select className="form-control" value={policyType} onChange={(e) => setPolicyType(e.target.value)}>
          <option value="AssetSwapPolicy">AssetSwapPolicy</option>
          <option value="StrategyExit">StrategyExit (Performance Fee)</option>
          <option value="LendingPolicy">LendingPolicy</option>
        </select>
        <button className="btn btn-primary" onClick={attachPolicy}>Attach</button>
      </div>
      {status && <p style={{marginTop: '10px', fontSize: '12px'}}>{status}</p>}
    </div>
  );
}
