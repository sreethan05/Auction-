import React, { useState } from 'react';
import { KeyRound, X, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { pinUnlock } from '../services/api';

/**
 * Team redeems the PIN the organizer handed them after the offline auction.
 * The PIN itself identifies the problem — teams never browse the catalog.
 * Wrong attempts are rate-limited server-side (5 wrong → 5-minute lockout).
 */
export function PinUnlockModal({ team, currentMember, onClose, onUnlocked }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError('Enter the PIN given by the organizers.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await pinUnlock({
        teamName: team.name,
        memberId: currentMember?.memberId,
        pin: pin.trim()
      });
      setSuccess(res.problem);
      onUnlocked(res.team, res.problem);
    } catch (err) {
      setError(err.message || 'PIN unlock failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="ov"
      style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', position: 'fixed', inset: 0, padding: '20px' }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div
        className="box"
        style={{
          maxWidth: '430px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0',
          borderRadius: '16px', padding: '26px 28px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.12)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px', background: '#f5f3ff',
              border: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed'
            }}>
              <KeyRound size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Redeem Unlock PIN</h3>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Won a problem at the auction? Enter its PIN.</div>
            </div>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px' }}><X size={16} /></button>
        </div>

        {success ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center',
            background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '22px 16px', marginBottom: '16px'
          }}>
            <CheckCircle2 size={30} color="#059669" />
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#047857' }}>
              Unlocked {success.id} — {success.title}!
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              The problem is now open for your team. The bid price was deducted from your shared balance.
            </div>
            <button className="btn-primary" onClick={onClose} style={{ padding: '9px 20px', borderRadius: '8px', marginTop: '4px' }}>
              Start Solving
            </button>
          </div>
        ) : (
          <>
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
              padding: '12px 14px', marginBottom: '18px', fontSize: '12.5px', color: '#475569', lineHeight: 1.55
            }}>
              Type the 6-digit PIN the organizers gave your team after winning the auction.
              The matching problem unlocks for your team only, and its bid price is deducted from your shared balance.
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', marginBottom: '14px',
                background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '12.5px', fontWeight: 600
              }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="6-digit PIN"
                maxLength={6}
                style={{
                  width: '100%', boxSizing: 'border-box', textAlign: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: '24px', fontWeight: 800, letterSpacing: '10px',
                  padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1', color: '#0f172a', outline: 'none',
                  marginBottom: '16px'
                }}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-ghost" onClick={onClose} disabled={loading} style={{ padding: '9px 16px', borderRadius: '8px' }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading || pin.trim().length === 0}
                  style={{ padding: '9px 20px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  {loading ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
                  {loading ? 'Unlocking...' : 'Unlock Problem'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
