import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Trophy, Coins, History, Undo2, Download, AlertTriangle, ScrollText } from 'lucide-react';
import {
  fetchEventSettings,
  adminSetEventClock,
  adminOverrideWildCardsClosed,
  adminFreezeLeaderboard,
  adminAdjustCoins,
  adminAdjustScore,
  adminUndoTransaction,
  adminDownloadCsv,
  adminResetLeaderboard,
  exportRowsToPdf,
  adminFetch
} from '../services/api';

function toLocalInputValue(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtCountdown(ms) {
  if (ms <= 0) return 'EXPIRED';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function EventLedgerSection({ teams, showToast }) {
  const [settings, setSettings] = useState(null);
  const [nowTs, setNowTs] = useState(Date.now());
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [savingClock, setSavingClock] = useState(false);

  const [transactions, setTransactions] = useState([]);
  const [auditLog, setAuditLog] = useState([]);

  // Override form
  const [adjTeam, setAdjTeam] = useState('');
  const [adjType, setAdjType] = useState('coins');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const s = await fetchEventSettings();
      setSettings(s);
    } catch (e) {}
  }, []);

  const loadLedger = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_BASE}/admin/overview`);
      const data = await res.json();
      if (res.ok) {
        setTransactions(data.transactions || []);
        setAuditLog(data.auditLog || []);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadSettings();
    loadLedger();
    const interval = setInterval(loadSettings, 3000);
    const tick = setInterval(() => setNowTs(Date.now()), 500);
    const ledgerInterval = setInterval(loadLedger, 6000);
    return () => { clearInterval(interval); clearInterval(tick); clearInterval(ledgerInterval); };
  }, [loadSettings, loadLedger]);

  // Populate the datetime inputs once settings arrive
  useEffect(() => {
    if (settings) {
      setStartAt(toLocalInputValue(settings.startAt));
      setEndAt(toLocalInputValue(settings.endAt));
    }
  }, [settings?.startAt, settings?.endAt]);

  const handleSaveClock = async () => {
    setSavingClock(true);
    try {
      const res = await adminSetEventClock({
        startAt: startAt ? new Date(startAt).getTime() : null,
        endAt: endAt ? new Date(endAt).getTime() : null
      });
      setSettings(res.eventSettings);
      showToast('⏰ Event clock saved. Countdown is live for everyone.');
    } catch (err) {
      showToast(err.message || 'Failed to save clock.', false);
    } finally {
      setSavingClock(false);
    }
  };

  const handleOverride = async (override) => {
    const reason = override ? window.prompt('OVERRIDE the wild card cutoff (T−20 min)?\nThis is a confirmed, logged action. Enter a reason:') : null;
    if (override && reason === null) return;
    try {
      const res = await adminOverrideWildCardsClosed(override, reason || '');
      setSettings(res.eventSettings);
      showToast(override ? '⚠️ Cutoff override ON (logged).' : '✅ Cutoff override OFF.');
    } catch (err) {
      showToast(err.message || 'Failed.', false);
    }
  };

  const handleFreeze = async () => {
    if (!settings) return;
    try {
      const res = await adminFreezeLeaderboard(!settings.leaderboardFrozen);
      setSettings(res.eventSettings);
      showToast(settings.leaderboardFrozen ? '📊 Leaderboard unfrozen — live again.' : '🧊 Leaderboard frozen at current standings.');
    } catch (err) {
      showToast(err.message || 'Failed.', false);
    }
  };

  const handleAdjust = async () => {
    const amount = Number(adjAmount);
    if (!adjTeam || isNaN(amount) || amount === 0) {
      showToast('Pick a team and enter a non-zero amount.', false);
      return;
    }
    if (!adjReason.trim()) {
      showToast('A reason is required for every manual override (it is logged).', false);
      return;
    }
    setAdjSubmitting(true);
    try {
      if (adjType === 'coins') {
        await adminAdjustCoins({ teamName: adjTeam, amount, reason: adjReason.trim() });
        showToast(`🪙 ${amount > 0 ? '+' : ''}${amount} coins applied to ${adjTeam} (logged).`);
      } else {
        await adminAdjustScore({ teamName: adjTeam, delta: amount, reason: adjReason.trim() });
        showToast(`🏆 ${amount > 0 ? '+' : ''}${amount} pts applied to ${adjTeam} (logged).`);
      }
      setAdjAmount('');
      setAdjReason('');
      await loadLedger();
    } catch (err) {
      showToast(err.message || 'Override failed.', false);
    } finally {
      setAdjSubmitting(false);
    }
  };

  const handleUndo = async (txn) => {
    if (!window.confirm(`Undo "${txn.item || txn.problemTitle || txn.type}" for ${txn.teamName} (${txn.bidAmount ?? txn.price ?? txn.cost ?? 0} coins)?\nThe coins are refunded and the action is logged.`)) return;
    try {
      await adminUndoTransaction(txn.id);
      showToast(`↩️ Refunded ${txn.bidAmount ?? txn.price ?? txn.cost ?? 0} coins to ${txn.teamName}.`);
      await loadLedger();
    } catch (err) {
      showToast(err.message || 'Undo failed.', false);
    }
  };

  const offset = settings ? settings.serverTime - Date.now() : 0;
  const remaining = settings?.endAt ? settings.endAt - (nowTs + offset) : null;
  const cutoffIn = settings?.cutoffAt ? settings.cutoffAt - (nowTs + offset) : null;

  return (
    <div>
      {/* EVENT CLOCK */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        padding: '18px 20px', marginBottom: '18px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Clock size={16} color="#7c3aed" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Event Clock</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>(runs on the server — page refreshes never reset it)</span>
        </div>

        {remaining !== null && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '10px', padding: '12px 20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.8px', color: '#7c3aed', marginBottom: '2px' }}>TIME REMAINING</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 800, color: '#4c1d95' }}>
                {fmtCountdown(remaining)}
              </div>
            </div>
            <div style={{
              background: cutoffIn !== null && cutoffIn <= 0 ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${cutoffIn !== null && cutoffIn <= 0 ? '#fecaca' : '#fde68a'}`,
              borderRadius: '10px', padding: '12px 20px'
            }}>
              <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.8px', color: cutoffIn !== null && cutoffIn <= 0 ? '#b91c1c' : '#b45309', marginBottom: '2px' }}>
                WILD CARD CUTOFF (T−20 MIN)
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 800, color: cutoffIn !== null && cutoffIn <= 0 ? '#b91c1c' : '#92400e' }}>
                {cutoffIn === null ? '—' : cutoffIn <= 0 ? 'CLOSED' : `in ${fmtCountdown(cutoffIn)}`}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>START TIME</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>END TIME</label>
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={inputStyle} />
          </div>
          <button className="btn-primary" onClick={handleSaveClock} disabled={savingClock} style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px' }}>
            {savingClock ? 'Saving...' : 'Save Clock'}
          </button>
        </div>
      </div>

      {/* LEADERBOARD CONTROL + CUTOFF OVERRIDE */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        padding: '18px 20px', marginBottom: '18px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Trophy size={16} color="#d97706" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Leaderboard Control</div>
            <div style={{ fontSize: '12px', color: settings?.leaderboardFrozen ? '#b45309' : '#059669', fontWeight: 600 }}>
              {settings?.leaderboardFrozen ? '🧊 FROZEN — participants see the snapshot from freeze time' : '🔴 LIVE — updating in real time'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn-ghost" onClick={handleFreeze} style={{ fontSize: '12px', padding: '8px 16px', fontWeight: 700 }}>
            {settings?.leaderboardFrozen ? 'Unfreeze Leaderboard' : 'Freeze Leaderboard'}
          </button>
          <button
            className="btn-ghost"
            onClick={async () => {
              if (!window.confirm('RESET the leaderboard? This clears all problem scores, penalties and solves (coins and unlocks are kept). Logged. Continue?')) return;
              try {
                const res = await adminResetLeaderboard();
                setSettings(res.eventSettings);
                showToast('📊 Leaderboard reset — scores cleared, coins/unlocks kept (logged).');
                await loadLedger();
              } catch (err) { showToast(err.message || 'Reset failed.', false); }
            }}
            title="Clear all scores/penalties/solves (keeps coins & unlocks)"
            style={{ fontSize: '12px', padding: '8px 16px', fontWeight: 700, color: '#dc2626', borderColor: '#fecaca', background: '#fff1f2' }}
          >
            Reset Leaderboard
          </button>
          {settings?.wildCardsOverride ? (
            <button className="btn-ghost" onClick={() => handleOverride(false)} style={{ fontSize: '12px', padding: '8px 14px', color: '#b45309', borderColor: '#fde68a', background: '#fffbeb', fontWeight: 700 }}>
              <AlertTriangle size={12} /> Cutoff Override: ON — disable
            </button>
          ) : (
            <button className="btn-ghost" onClick={() => handleOverride(true)} style={{ fontSize: '12px', padding: '8px 14px', fontWeight: 600 }}>
              Override Wild Card Cutoff
            </button>
          )}
        </div>
      </div>

      {/* MANUAL OVERRIDE */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        padding: '18px 20px', marginBottom: '18px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Coins size={16} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Manual Override</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>(adjust coins or points — every change is logged)</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '170px' }}>
            <label style={labelStyle}>TEAM</label>
            <select value={adjTeam} onChange={(e) => setAdjTeam(e.target.value)} style={inputStyle}>
              <option value="">— Select team —</option>
              {teams.map(t => <option key={t.name} value={t.name}>{t.name} ({t.balance ?? 1000} BC · {t.score || 0} pts)</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '110px' }}>
            <label style={labelStyle}>TYPE</label>
            <select value={adjType} onChange={(e) => setAdjType(e.target.value)} style={inputStyle}>
              <option value="coins">Coins (±)</option>
              <option value="score">Points (±)</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '100px' }}>
            <label style={labelStyle}>AMOUNT</label>
            <input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="e.g. 50 or -30" style={inputStyle} />
          </div>
          <div style={{ flex: 2, minWidth: '180px' }}>
            <label style={labelStyle}>REASON (REQUIRED)</label>
            <input value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. Correcting double deduction" style={inputStyle} />
          </div>
          <button className="btn-primary" onClick={handleAdjust} disabled={adjSubmitting} style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px' }}>
            {adjSubmitting ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>

      {/* TRANSACTION LOG */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        marginBottom: '18px', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <History size={15} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Transaction Log</h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>(bids, adjustments, heists — undo restores the coins)</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-ghost"
            onClick={() => adminDownloadCsv('transactions').catch(err => showToast(err.message || 'Export failed', false))}
            style={{ fontSize: '12px', padding: '6px 14px', fontWeight: 600 }}
          >
            <Download size={12} /> Export CSV
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              try {
                exportRowsToPdf('Transaction Log — The Bid to Win', transactions, [
                  { label: 'Time', get: (t) => t.timestamp ? new Date(typeof t.timestamp === 'number' ? t.timestamp : t.timestamp).toLocaleString() : (t.displayTime || '') },
                  { label: 'Team', get: (t) => t.teamName || '' },
                  { label: 'Item', get: (t) => t.item || t.problemTitle || t.problemId || t.type || '' },
                  { label: 'Amount', get: (t) => String(t.bidAmount ?? t.price ?? t.cost ?? 0) },
                  { label: 'Balance After', get: (t) => String(t.remainingBalance ?? '') },
                  { label: 'By', get: (t) => t.recordedBy || t.purchasedByName || '' }
                ]);
              } catch (err) { showToast(err.message || 'PDF export failed', false); }
            }}
            style={{ fontSize: '12px', padding: '6px 14px', fontWeight: 600 }}
          >
            <Download size={12} /> Export PDF
          </button>
          </div>
        </div>
        <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', top: 0 }}>
                <th style={{ padding: '8px 14px' }}>Time</th>
                <th style={{ padding: '8px 14px' }}>Team</th>
                <th style={{ padding: '8px 14px' }}>Item</th>
                <th style={{ padding: '8px 14px' }}>Amount</th>
                <th style={{ padding: '8px 14px' }}>Balance After</th>
                <th style={{ padding: '8px 14px' }}>By</th>
                <th style={{ padding: '8px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => {
                const amount = t.bidAmount ?? t.price ?? t.cost ?? 0;
                const undoable = !t.undone && t.type !== 'COIN_HEIST' && amount !== 0;
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc', opacity: t.undone ? 0.55 : 1 }}>
                    <td style={{ padding: '8px 14px', color: '#64748b' }}>
                      {t.timestamp ? new Date(typeof t.timestamp === 'number' ? t.timestamp : t.timestamp).toLocaleTimeString() : (t.displayTime || '—')}
                    </td>
                    <td style={{ padding: '8px 14px', fontWeight: 700, color: '#0f172a' }}>{t.teamName}</td>
                    <td style={{ padding: '8px 14px' }}>
                      <span style={{ color: '#2563eb', fontWeight: 600 }}>{t.item || t.problemTitle || t.problemId || t.type}</span>
                      {t.type && <span style={{ color: '#94a3b8', fontSize: '10.5px' }}> · {t.type}</span>}
                    </td>
                    <td style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: amount >= 0 ? '#059669' : '#dc2626' }}>
                      {amount >= 0 ? '+' : ''}{amount}
                    </td>
                    <td style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)' }}>{t.remainingBalance ?? '—'}</td>
                    <td style={{ padding: '8px 14px', color: '#64748b' }}>{t.recordedBy || t.purchasedByName || t.purchasedBy || '—'}</td>
                    <td style={{ padding: '8px 14px' }}>
                      {t.undone ? (
                        <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>↩ UNDONE</span>
                      ) : undoable ? (
                        <button
                          className="btn-ghost"
                          onClick={() => handleUndo(t)}
                          style={{ fontSize: '11px', padding: '4px 10px', color: '#b45309', borderColor: '#fde68a', background: '#fffbeb', fontWeight: 700 }}
                        >
                          <Undo2 size={11} /> Undo
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No transactions recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AUDIT LOG */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <ScrollText size={15} color="#7c3aed" />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Audit Log</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>(every admin action, override, and correction)</span>
        </div>
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px', position: 'sticky', top: 0 }}>
                <th style={{ padding: '8px 14px' }}>Time</th>
                <th style={{ padding: '8px 14px' }}>Action</th>
                <th style={{ padding: '8px 14px' }}>Target</th>
                <th style={{ padding: '8px 14px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '8px 14px', color: '#64748b', whiteSpace: 'nowrap' }}>{new Date(a.timestamp).toLocaleTimeString()}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 700, color: '#7c3aed' }}>{a.action}</td>
                  <td style={{ padding: '8px 14px' }}>{a.targetType ? `${a.targetType} · ${a.targetId}` : '—'}</td>
                  <td style={{ padding: '8px 14px', color: '#475569' }}>{a.details || '—'}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No admin actions logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', fontSize: '13px', padding: '9px 12px', background: '#ffffff',
  border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', boxSizing: 'border-box', outline: 'none'
};

const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px'
};
