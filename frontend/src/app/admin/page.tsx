"use client";

import React, { useState, useEffect } from 'react';

// NextAuth mock session hook
function useSession() {
    // In a real implementation, this returns the authenticated Google User session.
    // For demo purposes, we mock an authenticated admin session.
    return {
        data: {
            user: { name: "Platform Admin", email: "admin@morelikely.com", role: "ADMIN" }
        },
        status: "authenticated"
    };
}

export default function PlatformAdminDashboard() {
    const { data: session, status } = useSession();
    const [isPaused, setIsPaused] = useState(false);
    const [cronInterval, setCronInterval] = useState("3600000");
    const [maxConcurrent, setMaxConcurrent] = useState("10");
    const [saving, setSaving] = useState(false);

    if (status === "loading") return <div style={styles.container}>Authenticating...</div>;
    
    // Role-Based Access Control (RBAC) enforcement
    if (status !== "authenticated" || session?.user?.role !== "ADMIN") {
        return (
            <div style={styles.container}>
                <h1 style={{color: 'red'}}>403 Forbidden</h1>
                <p>You do not have permission to access the platform admin portal.</p>
            </div>
        );
    }

    useEffect(() => {
        // Load initial config from live API
        fetch('/api/admin/config')
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    setCronInterval(data.cronIntervalMs.toString());
                    setMaxConcurrent(data.maxConcurrentJobs.toString());
                    setIsPaused(data.isPaused);
                }
            })
            .catch(err => console.error("Failed to load config:", err));
    }, []);

    const handleSaveConfig = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cronIntervalMs: parseInt(cronInterval),
                    maxConcurrentJobs: parseInt(maxConcurrent),
                    isPaused: isPaused
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            alert("Database configuration updated successfully. Scheduler will adapt on its next loop.");
        } catch (error: any) {
            alert(`Error saving config: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.title}>Platform Command Center</h1>
                <div style={styles.userBadge}>
                    {session.user.email} (SSO Authenticated)
                </div>
            </div>

            <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Managed Treasuries (Gemini)</span>
                    <span style={styles.statValue}>142</span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>Active Scheduler Loop</span>
                    <span style={{ ...styles.statValue, color: isPaused ? 'red' : 'green', fontWeight: 'bold' }}>
                        {isPaused ? 'PAUSED' : 'RUNNING'}
                    </span>
                </div>
                <div style={styles.statCard}>
                    <span style={styles.statLabel}>0G / Private Nodes (Unmanaged)</span>
                    <span style={styles.statValue}>38</span>
                </div>
            </div>

            <div style={styles.card}>
                <h2 style={styles.cardTitle}>Scheduler Database Configuration</h2>
                <p style={styles.helpText}>These values are read dynamically by the background Node.js daemon. Modifying them takes effect immediately without requiring a server reboot.</p>
                
                <div style={styles.formGroup}>
                    <label style={styles.label}>Emergency Pause Switch</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button 
                            style={{...styles.button, width: '120px', backgroundColor: isPaused ? '#28a745' : '#dc3545'}}
                            onClick={() => setIsPaused(!isPaused)}
                        >
                            {isPaused ? 'Resume Jobs' : 'Pause All Jobs'}
                        </button>
                        <span style={styles.helpText}>Instantly halts all automated AI inferences for Gemini subscribers.</span>
                    </div>
                </div>

                <div style={styles.formGroup}>
                    <label style={styles.label}>Cron Interval (Milliseconds)</label>
                    <input 
                        type="number" 
                        value={cronInterval} 
                        onChange={(e) => setCronInterval(e.target.value)} 
                        style={styles.input}
                    />
                    <p style={styles.helpText}>How often the background daemon polls the database for active subscribers.</p>
                </div>

                <div style={styles.formGroup}>
                    <label style={styles.label}>Max Concurrent Jobs</label>
                    <input 
                        type="number" 
                        value={maxConcurrent} 
                        onChange={(e) => setMaxConcurrent(e.target.value)} 
                        style={styles.input}
                    />
                    <p style={styles.helpText}>Limits the number of simultaneous HTTP requests made to the Gemini API to prevent rate-limiting.</p>
                </div>

                <button 
                    onClick={handleSaveConfig} 
                    disabled={saving} 
                    style={{...styles.button, width: 'auto', padding: '10px 24px', opacity: saving ? 0.7 : 1}}
                >
                    {saving ? 'Writing to DB...' : 'Save Database Configuration'}
                </button>
            </div>

            <div style={{...styles.card, marginTop: '30px'}}>
                <h2 style={styles.cardTitle}>Deployed Agents & Resource Usage</h2>
                <p style={styles.helpText}>Monitor active AI Governors to collectively reduce usage during network congestion.</p>
                <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '16px'}}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Treasury ID</th>
                            <th style={styles.th}>Owner Address</th>
                            <th style={styles.th}>Provider</th>
                            <th style={styles.th}>Monthly Inferences</th>
                            <th style={styles.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={styles.td}>treasury-1</td>
                            <td style={styles.td}>0x123...abc</td>
                            <td style={styles.td}>Gemini (Subscriber)</td>
                            <td style={styles.td}>142 / 1000</td>
                            <td style={styles.td}><span style={{color: 'green'}}>Active</span></td>
                        </tr>
                        <tr>
                            <td style={styles.td}>treasury-3</td>
                            <td style={styles.td}>0x789...def</td>
                            <td style={styles.td}>Gemini (Subscriber)</td>
                            <td style={styles.td}>850 / 1000</td>
                            <td style={styles.td}><span style={{color: 'orange'}}>High Usage</span></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: { maxWidth: '900px', margin: '40px auto', fontFamily: 'system-ui, sans-serif', color: '#333' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' },
    title: { fontSize: '28px', fontWeight: 'bold', margin: 0 },
    userBadge: { backgroundColor: '#e2e8f0', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '500' },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' },
    statCard: { backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #eaeaea' },
    statLabel: { display: 'block', fontSize: '13px', color: '#666', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' },
    statValue: { display: 'block', fontSize: '24px', fontWeight: 'bold' },
    card: { padding: '30px', border: '1px solid #eaeaea', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', backgroundColor: '#fff' },
    cardTitle: { fontSize: '20px', marginBottom: '8px', marginTop: 0 },
    formGroup: { marginBottom: '24px', marginTop: '24px' },
    label: { display: 'block', fontWeight: '600', marginBottom: '8px' },
    input: { width: '100%', maxWidth: '300px', padding: '10px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '16px' },
    helpText: { fontSize: '13px', color: '#666', marginTop: '6px', lineHeight: '1.4' },
    button: { padding: '10px 16px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600', cursor: 'pointer' },
    th: { textAlign: 'left', padding: '12px 8px', borderBottom: '2px solid #eaeaea', fontSize: '14px', color: '#666' },
    td: { padding: '12px 8px', borderBottom: '1px solid #eaeaea', fontSize: '14px' }
};
