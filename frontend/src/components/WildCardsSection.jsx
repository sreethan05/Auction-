import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap, Shield, Clock, X, AlertTriangle, Ban, Check, Coins, Power,
  ChevronRight, History, Snowflake
} from 'lucide-react';
import {
  fetchWildcards,
  adminBidWildCard,
  adminActivateWildCard,
  adminArmWildCard,
  adminCancelActivation,
  adminToggleWildCard,
  adminOverrideWildCardsClosed
} from '../services/api';

const KIND_STYLES = {
  ATTACK: { color: '#e11d48', bg: '#fff1f2', border: '#fecdd3', label: 'ATTACK' },
  DEFENSE: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', label: 'DEFENSE' },
  UTILITY: { color: '#059669', bg: '#ecfdf5', border: '#a7f3d0', label: 'UTILITY' }
};

function fmtCountdown(ms) {
  if (ms <= 0) return '00:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function WildCardsSection({ teams, problems, showToast }) {
  const [data, setData] = useState({ cards: [], activeEffects: { active: [], armed: [] }, activationLog: [], eventSettings: null });
  const [loading, setLoading] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  // Record-bid form
  const [bidCardId, setBidCardId] = useState('');
  const [bidTeam, setBidTeam] = useState('');
  const [bidCoins, setBidCoins] = useState('');
  const [bidSubmitting, setBidSubmitting] = useState(false);

  // Activation modal: { card, teamName }
  const [activateModal, setActivateModal] = useState(null);
  const [activateTarget, setActivateTarget] = useState('');
  const [activateProblem, setActivateProblem] = useState('');
  const [activateTargetProblem, setActivateTargetProblem] = useState('');
  const [activateLang, setActivateLang] = useState('python');
  const [activateAmount, setActivateAmount] = useState('100');
  const [activateSubmitting, setActivateSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const d = await fetchWildcards();
      setData(d);
    } catch (err) {
      console.error('Wildcards load failed:', err);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    const tick = setInterval(() => setNowTs(Date.now()), 500);
    return () => { clearInterval(interval); clearInterval(tick); };
  }, [loadData]);

  const eventSettings = data.eventSettings || {};
  const isClosed = Boolean(eventSettings.wildCardsClosed);
  const overrideOn = Boolean(eventSettings.wildCardsOverride);

  const availableCards = data.cards.filter(c => !c.owner);
  const ownedCards = data.cards.filter(c => c.owner);
  const activeEffects = data.activeEffects?.active || [];
  const armedDefenses = data.activeEffects?.armed || [];

  const handleRecordBid = async () => {
    if (!bidCardId || !bidTeam) {
      showToast('Select both a card and a team for the offline bid.', false);
      return;
    }
    const coins = Number(bidCoins);
    if (isNaN(coins) || coins < 0) {
      showToast('Enter the coins paid in the offline bid.', false);
      return;
    }
    setBidSubmitting(true);
    try {
      await adminBidWildCard({ cardId: bidCardId, teamName: bidTeam, coins });
      const card = data.cards.find(c => c.id === bidCardId);
      showToast(`🃏 Recorded: ${card?.name} → ${bidTeam} (−${coins} coins).`);
      setBidCardId('');
      setBidCoins('');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to record bid.', false);
    } finally {
      setBidSubmitting(false);
    }
  };

  const openActivateModal = (card) => {
    const owner = teams.find(t => t.name.toLowerCase() === (card.owner || '').toLowerCase());
    setActivateModal({ card, teamName: owner?.name || card.owner });
    setActivateTarget('');
    setActivateProblem('');
    setActivateTargetProblem('');
    setActivateLang('python');
    setActivateAmount('100');
  };

  const handleActivate = async () => {
    if (!activateModal) return;
    const { card, teamName } = activateModal;
    if (card.kind === 'ATTACK' && !activateTarget) {
      showToast('Pick a target team for this attack card.', false);
      return;
    }
    if (card.scope === 'PROBLEM' && !activateProblem) {
      showToast('Pick the problem this card applies to.', false);
      return;
    }
    setActivateSubmitting(true);
    try {
      const res = await adminActivateWildCard({
        cardId: card.id,
        teamName,
        targetTeam: card.kind === 'ATTACK' ? activateTarget : undefined,
        problemId: card.scope === 'PROBLEM' ? activateProblem : undefined,
        targetProblemId: card.id === 'SKIP_SWAP' ? activateTargetProblem : undefined,
        lang: card.id === 'LANGUAGE_LOCK' ? activateLang : undefined,
        amount: card.id === 'COIN_HEIST' ? Number(activateAmount) : undefined
      });
      if (res.blocked) {
        showToast(`🛡️ Blocked! ${res.targetTeam?.name || 'Target'}'s Shield consumed the ${card.name}.`, false);
      } else if (res.mirrored) {
        showToast(`🪞 Mirrored! ${card.name} bounced back onto ${res.targetTeam?.name || teamName}.`, false);
      } else {
        showToast(`✅ ${card.name} activated: ${res.activation?.details || 'done'}.`);
      }
      setActivateModal(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Activation failed.', false);
    } finally {
      setActivateSubmitting(false);
    }
  };

  const handleArm = async (card) => {
    try {
      await adminArmWildCard({ cardId: card.id, teamName: card.owner });
      showToast(`🛡️ ${card.name} armed for ${card.owner} — it will block the next incoming attack.`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to arm card.', false);
    }
  };

  const handleCancel = async (activationId, label) => {
    if (!window.confirm(`Cancel "${label}"? This is logged in the audit trail.`)) return;
    try {
      await adminCancelActivation(activationId);
      showToast(`✂️ Cancelled: ${label}.`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to cancel.', false);
    }
  };

  const handleToggle = async (card) => {
    try {
      await adminToggleWildCard(card.id, !card.enabled);
      showToast(`${card.enabled ? '⛔ Disabled' : '✅ Enabled'} card: ${card.name}.`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to toggle card.', false);
    }
  };

  const ownerTeamProblems = (teamName) => {
    const t = teams.find(x => x.name.toLowerCase() === (teamName || '').toLowerCase());
    return problems.filter(p => (t?.unlocked || []).includes(p.id));
  };

  return (
    <div>
      {/* CUTOFF BANNER */}
      {(isClosed || overrideOn) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap',
          padding: '14px 18px', borderRadius: '12px', marginBottom: '18px',
          background: overrideOn ? '#fffbeb' : '#fef2f2',
          border: `1px solid ${overrideOn ? '#fde68a' : '#fecaca'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: overrideOn ? '#b45309' : '#b91c1c', fontWeight: 700, fontSize: '13px' }}>
            <AlertTriangle size={16} />
            {overrideOn
              ? 'Wild card cutoff OVERRIDE is active — bidding/activation allowed past T−20 min (logged).'
              : 'WILD CARDS CLOSED — last 20 minutes of the event. Bidding, activation, and arming are disabled.'}
          </div>
          {overrideOn ? (
            <button
              className="btn-ghost"
              onClick={() => { if (window.confirm('Re-enable the wild card cutoff?')) {
                adminOverrideWildCardsClosed(false, 'Re-enabled cutoff from dashboard').then(() => loadData());
              } }}
              style={{ fontSize: '12px', padding: '7px 14px', fontWeight: 600 }}
            >
              Re-enable Cutoff
            </button>
          ) : (
            <button
              className="btn-ghost"
              onClick={() => {
                const reason = window.prompt('OVERRIDE the wild card cutoff? This is a confirmed, logged action.\nEnter a reason:');
                if (reason !== null) {
                  adminOverrideWildCardsClosed(true, reason || 'No reason provided').then(() => loadData());
                }
              }}
              style={{ fontSize: '12px', padding: '7px 14px', fontWeight: 600, color: '#b45309', borderColor: '#fde68a', background: '#fffbeb' }}
            >
              Override (Logged)
            </button>
          )}
        </div>
      )}

      {/* RECORD OFFLINE BID */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        padding: '18px 20px', marginBottom: '20px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
          <Coins size={16} color="#7c3aed" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
            Record Offline Wild Card Bid
          </h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>(each card has exactly ONE copy)</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px' }}>CARD</label>
            <select
              value={bidCardId}
              onChange={(e) => {
                setBidCardId(e.target.value);
                const c = data.cards.find(x => x.id === e.target.value);
                if (c) setBidCoins(String(c.defaultBid));
              }}
              style={selectStyle}
            >
              <option value="">— Select an available card —</option>
              {availableCards.filter(c => c.enabled).map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name} (suggested {c.defaultBid})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 2, minWidth: '180px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px' }}>WINNING TEAM</label>
            <select value={bidTeam} onChange={(e) => setBidTeam(e.target.value)} style={selectStyle}>
              <option value="">— Select team —</option>
              {teams.map(t => (
                <option key={t.name} value={t.name}>{t.name} ({t.balance ?? 1000} BC)</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: '130px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px' }}>COINS PAID</label>
            <input
              type="number" min="0" value={bidCoins}
              onChange={(e) => setBidCoins(e.target.value)}
              placeholder="e.g. 80"
              style={selectStyle}
            />
          </div>
          <button
            className="btn-primary"
            onClick={handleRecordBid}
            disabled={bidSubmitting || isClosed}
            title={isClosed ? 'Wild cards are closed' : 'Record the offline bid and deduct coins'}
            style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px', opacity: isClosed ? 0.5 : 1 }}
          >
            {bidSubmitting ? 'Recording...' : 'Record Bid'}
          </button>
        </div>
      </div>

      {/* ACTIVE EFFECTS (live, with countdowns + cancel) */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        marginBottom: '20px', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <Clock size={15} color="#e11d48" />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Active Effects</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>({activeEffects.length} live · server-timed)</span>
        </div>
        {activeEffects.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            No active effects right now.
          </div>
        )}
        {activeEffects.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f8fafc', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              <span style={{ fontSize: '20px' }}>{iconFor(a.cardId)}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  {a.cardName} <span style={{ color: '#94a3b8', fontWeight: 500 }}>on</span> {a.targetTeam}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>played by {a.byTeam}{a.problemId ? ` · ${a.problemId}` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {a.remainingSeconds !== null && a.remainingSeconds !== undefined ? (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 800, color: '#e11d48',
                  background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', padding: '4px 12px', minWidth: '78px', textAlign: 'center'
                }}>
                  {fmtCountdown(a.remainingSeconds * 1000)}
                </span>
              ) : (
                <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '4px 10px' }}>
                  UNTIL NEXT SOLVE
                </span>
              )}
              <button
                className="btn-ghost"
                onClick={() => handleCancel(a.id, `${a.cardName} on ${a.targetTeam}`)}
                style={{ fontSize: '12px', padding: '6px 12px', color: '#dc2626', borderColor: '#fecdd3', background: '#fff1f2', fontWeight: 600 }}
              >
                <Ban size={12} /> Cancel
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ARMED DEFENSES */}
      {armedDefenses.length > 0 && (
        <div style={{
          background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
          marginBottom: '20px', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
            <Shield size={15} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Armed Defenses</h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>(auto-block the next attack)</span>
          </div>
          {armedDefenses.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid #f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>{iconFor(a.cardId)}</span>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                  {a.cardName} <span style={{ color: '#94a3b8', fontWeight: 500 }}>armed for</span> {a.byTeam}
                </div>
              </div>
              <button
                className="btn-ghost"
                onClick={() => handleCancel(a.id, `${a.cardName} (armed for ${a.byTeam})`)}
                style={{ fontSize: '12px', padding: '5px 12px', fontWeight: 600 }}
              >
                Disarm
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CARD CATALOG */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        marginBottom: '20px', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <Zap size={15} color="#7c3aed" />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Wild Card Catalog</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>({data.cards.length} cards · 1 copy each)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))' }}>
          {data.cards.map(card => {
            const ks = KIND_STYLES[card.kind] || KIND_STYLES.UTILITY;
            return (
              <div key={card.id} style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #f8fafc', opacity: card.enabled ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '22px' }}>{card.icon}</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{card.name}</div>
                      <span style={{
                        fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.6px', padding: '2px 7px', borderRadius: '4px',
                        color: ks.color, background: ks.bg, border: `1px solid ${ks.border}`
                      }}>
                        {ks.label}{card.durationMin ? ` · ${card.durationMin} MIN` : ''}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleToggle(card)}
                    title={card.enabled ? 'Disable this card' : 'Enable this card'}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer', color: card.enabled ? '#059669' : '#94a3b8', padding: '2px'
                    }}
                  >
                    <Power size={14} />
                  </button>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5, minHeight: '36px', marginBottom: '10px' }}>
                  {card.description}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  {card.owner ? (
                    <>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '6px', padding: '4px 10px' }}>
                        SOLD · {card.owner}{card.bidAmount !== null ? ` · ${card.bidAmount} BC` : ''}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {card.kind === 'DEFENSE' && !card.armedFor && (
                          <button
                            className="btn-ghost"
                            onClick={() => handleArm(card)}
                            disabled={isClosed}
                            style={{ fontSize: '11px', padding: '5px 10px', color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff', fontWeight: 700 }}
                          >
                            <Shield size={11} /> Arm
                          </button>
                        )}
                        {card.kind !== 'DEFENSE' && (
                          <button
                            className="btn-primary"
                            onClick={() => openActivateModal(card)}
                            disabled={isClosed}
                            style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '6px', fontWeight: 700 }}
                          >
                            Activate <ChevronRight size={11} />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px' }}>
                      AVAILABLE · suggested {card.defaultBid} BC
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ACTIVATION LOG */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <History size={15} color="#2563eb" />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Activation Log</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>(who used it, target, start, end)</span>
        </div>
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '8px 14px' }}>Time</th>
                <th style={{ padding: '8px 14px' }}>Card</th>
                <th style={{ padding: '8px 14px' }}>Action</th>
                <th style={{ padding: '8px 14px' }}>By</th>
                <th style={{ padding: '8px 14px' }}>Target</th>
                <th style={{ padding: '8px 14px' }}>Coins</th>
                <th style={{ padding: '8px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.activationLog.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '8px 14px', color: '#64748b' }}>{new Date(a.timestamp || a.startedAt).toLocaleTimeString()}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 700, color: '#0f172a' }}>{a.cardName || a.cardId}</td>
                  <td style={{ padding: '8px 14px', color: '#64748b' }}>{a.action}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 600 }}>{a.byTeam || '—'}</td>
                  <td style={{ padding: '8px 14px' }}>{a.targetTeam || '—'}</td>
                  <td style={{ padding: '8px 14px', fontFamily: 'var(--font-mono)' }}>{a.coins ?? '—'}</td>
                  <td style={{ padding: '8px 14px' }}>
                    <StatusChip status={a.status} />
                  </td>
                </tr>
              ))}
              {(!data.activationLog || data.activationLog.length === 0) && (
                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No wild card activity yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ACTIVATE MODAL */}
      {activateModal && (
        <div className="ov" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', position: 'fixed', inset: 0, padding: '20px' }}
          onClick={(e) => { if (e.target === e.currentTarget && !activateSubmitting) setActivateModal(null); }}
        >
          <div className="box" style={{ maxWidth: '460px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '26px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '24px' }}>{activateModal.card.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Activate: {activateModal.card.name}</h3>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Owner: {activateModal.teamName}</div>
                </div>
              </div>
              <button className="btn-ghost" onClick={() => !activateSubmitting && setActivateModal(null)} style={{ padding: '6px' }}><X size={16} /></button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#475569', marginBottom: '16px', lineHeight: 1.5 }}>
              {activateModal.card.description}
            </div>

            {activateModal.card.kind === 'ATTACK' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>TARGET TEAM</label>
                <select value={activateTarget} onChange={(e) => setActivateTarget(e.target.value)} style={selectStyle}>
                  <option value="">— Pick the target team —</option>
                  {teams.filter(t => t.name.toLowerCase() !== (activateModal.teamName || '').toLowerCase()).map(t => (
                    <option key={t.name} value={t.name}>{t.name}{t.frozenUntil > Date.now() ? ' (frozen)' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {(activateModal.card.scope === 'PROBLEM') && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>
                  {activateModal.card.id === 'SKIP_SWAP' ? 'PROBLEM TO SWAP AWAY' : 'TARGET PROBLEM'}
                </label>
                <select value={activateProblem} onChange={(e) => setActivateProblem(e.target.value)} style={selectStyle}>
                  <option value="">— Pick an unlocked problem —</option>
                  {ownerTeamProblems(activateModal.teamName).map(p => (
                    <option key={p.id} value={p.id}>{p.id} — {p.title} ({p.diff})</option>
                  ))}
                </select>
              </div>
            )}

            {activateModal.card.id === 'SKIP_SWAP' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>REPLACEMENT PROBLEM (same difficulty)</label>
                <select value={activateTargetProblem} onChange={(e) => setActivateTargetProblem(e.target.value)} style={selectStyle}>
                  <option value="">— Pick replacement —</option>
                  {problems
                    .filter(p => !activateProblem || p.diff === (problems.find(x => x.id === activateProblem)?.diff || ''))
                    .filter(p => p.id !== activateProblem)
                    .map(p => <option key={p.id} value={p.id}>{p.id} — {p.title} ({p.diff})</option>)}
                </select>
              </div>
            )}

            {activateModal.card.id === 'LANGUAGE_LOCK' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>LOCKED LANGUAGE</label>
                <select value={activateLang} onChange={(e) => setActivateLang(e.target.value)} style={selectStyle}>
                  <option value="python">Python 3</option>
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                  <option value="java">Java</option>
                </select>
              </div>
            )}

            {activateModal.card.id === 'COIN_HEIST' && (
              <div style={{ marginBottom: '14px' }}>
                <label style={labelStyle}>COINS TO STEAL</label>
                <input type="number" min="1" value={activateAmount} onChange={(e) => setActivateAmount(e.target.value)} style={selectStyle} />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setActivateModal(null)} disabled={activateSubmitting} style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px' }}>
                Cancel
              </button>
              <button
                type="button" className="btn-primary" onClick={handleActivate}
                disabled={activateSubmitting || (activateModal.card.kind === 'ATTACK' && !activateTarget) || (activateModal.card.scope === 'PROBLEM' && !activateProblem)}
                style={{ padding: '9px 20px', fontSize: '13px', borderRadius: '8px' }}
              >
                {activateSubmitting ? 'Activating...' : 'Confirm Activation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function iconFor(cardId) {
  const icons = {
    HINT: '💡', FREEZE: '❄️', AI_DEBUG: '🤖', BLACKOUT: '🌑', NO_BACKSPACE: '⌫',
    SHIELD: '🛡️', MIRROR: '🪞', INSURANCE: '📜', DOUBLE_POINTS: '✌️', SKIP_SWAP: '🔄',
    COIN_HEIST: '🪙', TIME_STEAL: '⏱️', TINY_FONT: '🔬', LANGUAGE_LOCK: '🔡',
    PEEK: '👁️', NO_AUTOCOMPLETE: '🚫'
  };
  return icons[cardId] || '🃏';
}

function StatusChip({ status }) {
  const map = {
    COMPLETED: { c: '#059669', bg: '#ecfdf5', b: '#a7f3d0' },
    ACTIVE: { c: '#e11d48', bg: '#fff1f2', b: '#fecdd3' },
    ARMED: { c: '#2563eb', bg: '#eff6ff', b: '#bfdbfe' },
    BLOCKED: { c: '#b45309', bg: '#fffbeb', b: '#fde68a' },
    CANCELLED: { c: '#64748b', bg: '#f1f5f9', b: '#e2e8f0' },
    CONSUMED: { c: '#7c3aed', bg: '#f5f3ff', b: '#ddd6fe' },
    ENDED: { c: '#64748b', bg: '#f1f5f9', b: '#e2e8f0' }
  };
  const s = map[status] || map.ENDED;
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 700, color: s.c, background: s.bg, border: `1px solid ${s.b}`, borderRadius: '10px', padding: '2px 9px' }}>
      {status}
    </span>
  );
}

const selectStyle = {
  width: '100%', fontSize: '13px', padding: '9px 12px', background: '#ffffff',
  border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', boxSizing: 'border-box', outline: 'none'
};

const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '5px'
};
