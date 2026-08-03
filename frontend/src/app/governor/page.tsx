"use client";

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import pkg from '../../../package.json';

function GovernorContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [activeTab, setActiveTab] = useState('deploy');
  
  // Deploy State
  const [treasuryNetwork, setTreasuryNetwork] = useState('arc_testnet');
  const [aiNetwork, setAiNetwork] = useState('0g');
  const [aiEnvironment, setAiEnvironment] = useState('testnet');
  const [frequency, setFrequency] = useState('daily');
  const [use0GStorage, setUse0GStorage] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // Management Mock Data
  const gasBudget = '0.045 ETH';
  const rateLimit = '24 Hours';
  const recentLogs = [
    { id: 'tx-0x123', action: 'Propose Swap: 100 USDC -> WETH', status: 'Success', date: '2026-07-31 14:00' },
    { id: 'tx-0x124', action: 'Check Market Data', status: 'No Action', date: '2026-07-30 14:00' },
  ];

  const handleDeploy = async () => {
    setDeploying(true);
    setTimeout(() => {
      alert('AI Governor deployed and Smart Wallet created successfully!');
      setDeploying(false);
      setActiveTab('manage');
    }, 2000);
  };

  const handleShare = () => {
    if (!id) {
      alert("No Treasury ID found to share.");
      return;
    }
    const domain = pkg.config?.domain || window.location.origin;
    const shareUrl = `${domain}/governor?id=${id}`;
    navigator.clipboard.writeText(shareUrl);
    alert(`Copied to clipboard: ${shareUrl}`);
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ ...styles.title, marginBottom: 0 }}>AI Governor Dashboard</h1>
        {id && (
          <button onClick={handleShare} style={{ ...styles.button, width: 'auto', padding: '8px 16px', backgroundColor: '#333' }}>
            🔗 Share Link
          </button>
        )}
      </div>
      
      <div style={styles.tabContainer}>
        <button 
          style={{...styles.tab, borderBottom: activeTab === 'deploy' ? '2px solid #0070f3' : 'none', fontWeight: activeTab === 'deploy' ? 'bold' : 'normal'}}
          onClick={() => setActiveTab('deploy')}
        >
          Deploy
        </button>
        <button 
          style={{...styles.tab, borderBottom: activeTab === 'manage' ? '2px solid #0070f3' : 'none', fontWeight: activeTab === 'manage' ? 'bold' : 'normal'}}
          onClick={() => setActiveTab('manage')}
        >
          Manage
        </button>
      </div>

      {activeTab === 'deploy' && (
        <div style={styles.card}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Treasury Deployment Network</label>
            <select value={treasuryNetwork} onChange={(e) => setTreasuryNetwork(e.target.value)} style={styles.input}>
              <option value="arc_testnet">Arc Testnet</option>
              <option value="eth_mainnet">Ethereum Mainnet</option>
              <option value="eth_testnet">Ethereum Testnet (Sepolia/Holesky)</option>
            </select>
            <p style={styles.helpText}>Select the blockchain network where your Treasury and Smart Wallet are deployed.</p>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>AI Network Engine</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={aiNetwork} onChange={(e) => setAiNetwork(e.target.value)} style={{...styles.input, flex: 2}}>
                <option value="0g">0G Compute (Decentralized)</option>
                <option value="gemini">Google Gemini (Centralized)</option>
              </select>
              
              {aiNetwork === '0g' && (
                <select value={aiEnvironment} onChange={(e) => setAiEnvironment(e.target.value)} style={{...styles.input, flex: 1}}>
                  <option value="testnet">Testnet</option>
                  <option value="mainnet">Mainnet</option>
                </select>
              )}
            </div>
            <p style={styles.helpText}>Select the inference engine and environment for your treasury.</p>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Invocation Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={styles.input}>
              <option value="hourly">Every 1 Hour</option>
              <option value="daily">Once a Day</option>
              <option value="weekly">Once a Week</option>
            </select>
            <p style={styles.helpText}>How often the AI analyzes the market and treasury.</p>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Audit Storage</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <input type="checkbox" checked={use0GStorage} onChange={(e) => setUse0GStorage(e.target.checked)} id="storage-toggle" />
              <label htmlFor="storage-toggle" style={{ cursor: 'pointer' }}>
                Persist Decision Reports to 0G Storage Layer
              </label>
            </div>
            {use0GStorage && (
              <div style={styles.warningBox}>
                ⚠️ Warning: Persisting full conversation transcripts to 0G Storage incurs additional ZG token fees per invocation.
              </div>
            )}
          </div>

          <button onClick={handleDeploy} disabled={deploying} style={{...styles.button, opacity: deploying ? 0.7 : 1}}>
            {deploying ? 'Deploying...' : 'Deploy Smart Wallet & Agent'}
          </button>
        </div>
      )}

      {activeTab === 'manage' && (
        <div style={styles.card}>
          <h2 style={{fontSize: '18px', marginBottom: '16px'}}>Smart Wallet Stats</h2>
          <div style={{display: 'flex', gap: '20px', marginBottom: '24px', flexWrap: 'wrap'}}>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Gas Budget</span>
              <span style={styles.statValue}>{gasBudget}</span>
            </div>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Join Treasury (Proposal 0)</span>
              <span style={styles.statValue}>1,250,000 USDC</span>
            </div>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Indirect TVL (Active Policies)</span>
              <span style={styles.statValue}>450,000 USDC</span>
            </div>
            <div style={styles.statBox}>
              <span style={styles.statLabel}>Rate Limit</span>
              <span style={styles.statValue}>{rateLimit}</span>
            </div>
          </div>

          <h2 style={{fontSize: '18px', marginBottom: '16px'}}>Recent Invocations & Inference Receipts</h2>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td style={styles.td}>{log.date}</td>
                  <td style={styles.td}>{log.action}</td>
                  <td style={styles.td}>{log.status}</td>
                  <td style={styles.td}>
                    <button style={styles.linkButton}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <button style={{...styles.button, backgroundColor: '#dc3545', marginTop: '24px'}}>
            Emergency: Drain Smart Wallet
          </button>
        </div>
      )}
    </div>
  );
}

export default function GovernorControlPanel() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <GovernorContent />
    </Suspense>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: '800px', margin: '40px auto', fontFamily: 'system-ui, sans-serif', color: '#333' },
  title: { fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' },
  tabContainer: { display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid #eaeaea' },
  tab: { padding: '10px 20px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' },
  card: { padding: '24px', border: '1px solid #eaeaea', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', backgroundColor: '#fff' },
  formGroup: { marginBottom: '20px' },
  label: { display: 'block', fontWeight: '600', marginBottom: '8px' },
  input: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px' },
  helpText: { fontSize: '13px', color: '#666', marginTop: '6px' },
  warningBox: { marginTop: '10px', padding: '12px', backgroundColor: '#fff3cd', color: '#856404', borderRadius: '6px', fontSize: '14px', border: '1px solid #ffeeba' },
  button: { width: '100%', padding: '12px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '600', cursor: 'pointer' },
  statBox: { flex: 1, padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px', border: '1px solid #eaeaea' },
  statLabel: { display: 'block', fontSize: '13px', color: '#666', marginBottom: '4px' },
  statValue: { display: 'block', fontSize: '20px', fontWeight: 'bold' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '12px 8px', borderBottom: '2px solid #eaeaea', fontSize: '14px', color: '#666' },
  td: { padding: '12px 8px', borderBottom: '1px solid #eaeaea', fontSize: '14px' },
  linkButton: { background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', textDecoration: 'underline' }
};
