import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Loader2 } from 'lucide-react';
import { proctorUnlockTeam } from '../services/api';

export function LockOverlay({ teamName, reason, onUnlocked }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Extract violation count if mentioned in reason (e.g. "15 violations detected")
  const match = reason ? reason.match(/(\d+)\s+violations/i) : null;
  const violationCount = match ? match[1] : null;

  const handleUnlock = async () => {
    if (!pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await proctorUnlockTeam(teamName, pin.trim());
      if (res.success) {
        onUnlocked(res.team);
      } else {
        setError(res.error || 'Invalid Organizer PIN');
      }
    } catch (err) {
      setError(err.message || 'Unlock failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ov" style={{ zIndex: 1000, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="box" style={{
        maxWidth: '420px',
        textAlign: 'center',
        padding: '32px 28px',
        background: '#ffffff',
        border: '1px solid #fecdd3',
        borderRadius: '16px',
        boxShadow: '0 24px 48px -12px rgba(225, 29, 72, 0.15), 0 10px 20px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Subtle Shield Icon */}
        <div style={{
          width: '52px',
          height: '52px',
          borderRadius: '14px',
          background: '#ffe4e6',
          border: '1px solid #fecdd3',
          color: '#e11d48',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px'
        }}>
          <ShieldAlert size={26} />
        </div>

        <h2 style={{ color: '#0f172a', margin: '0 0 6px', fontSize: '22px', fontWeight: 800, letterSpacing: '0.2px' }}>
          Session Locked
        </h2>

        <div style={{ color: '#64748b', fontSize: '14px', marginBottom: '14px', fontWeight: 500 }}>
          Security verification required
        </div>

        {violationCount ? (
          <div style={{
            display: 'inline-block',
            padding: '4px 14px',
            borderRadius: '12px',
            background: '#fee2e2',
            border: '1px solid #fca5a5',
            color: '#b91c1c',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '20px'
          }}>
            {violationCount} violations detected
          </div>
        ) : (
          <div style={{
            color: '#64748b',
            fontSize: '13px',
            marginBottom: '20px',
            lineHeight: 1.5,
            maxWidth: '340px',
            margin: '0 auto 20px'
          }}>
            {reason || 'Anti-cheat integrity threshold reached.'}
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <input
            type="password"
            placeholder="Enter organizer PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            autoFocus
            style={{
              textAlign: 'center',
              letterSpacing: '4px',
              fontSize: '16px',
              padding: '12px 14px',
              width: '100%',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              outline: 'none',
              fontWeight: 700
            }}
          />
          {error && (
            <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '8px', fontWeight: 600 }}>
              {error}
            </div>
          )}
        </div>

        <button
          className="btn-primary"
          onClick={handleUnlock}
          disabled={loading || !pin.trim()}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)'
          }}
        >
          {loading ? <Loader2 size={16} className="spin" /> : 'Unlock Session'}
        </button>

        <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '16px' }}>
          Organizers may also unlock remotely from the Admin Dashboard
        </div>
      </div>
    </div>
  );
}
