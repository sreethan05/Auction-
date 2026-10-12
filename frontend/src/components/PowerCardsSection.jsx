import React, { useState } from 'react';
import { Lightbulb, Zap, Coins, Check, X, ShieldAlert, Lock, Unlock } from 'lucide-react';
import { purchaseHintPass, purchaseSabotageCard, useHintPass } from '../services/api';
import { SabotageTargetModal } from './SabotageTargetModal';

export function PowerCardsSection({
  team,
  currentMember,
  unlockedProblems = [],
  onTeamUpdated,
  onOpenProblem
}) {
  const [loadingHint, setLoadingHint] = useState(false);
  const [loadingSabotage, setLoadingSabotage] = useState(false);
  const [showSabotageModal, setShowSabotageModal] = useState(false);
  const [showHintModal, setShowHintModal] = useState(false);
  const [selectedHintProblemId, setSelectedHintProblemId] = useState('');
  const [notification, setNotification] = useState(null);
  const [recentUnlockedCard, setRecentUnlockedCard] = useState(null);

  const teamBalance = team?.balance ?? 1000;
  const hintPassesCount = team?.hintPassesCount || 0;
  const sabotageCardsCount = team?.sabotageCardsCount || 0;
  const canAfford = teamBalance >= 40;

  const isHintUnlocked = Boolean(team?.unlockedCards?.includes('HINT') || team?.hintUnlocked);
  const isSabotageUnlocked = Boolean(team?.unlockedCards?.includes('SABOTAGE') || team?.sabotageUnlocked);

  const unlockedWithoutHints = unlockedProblems.filter(
    (p) => !team?.revealedHints || !team.revealedHints[p.id]
  );

  const handlePurchaseHintPass = async () => {
    if (!canAfford) {
      setNotification({
        type: 'error',
        message: 'Insufficient balance to purchase Hint Pass.'
      });
      return;
    }

    setLoadingHint(true);
    setNotification(null);
    try {
      const res = await purchaseHintPass({
        teamName: team.name,
        memberId: currentMember?.memberId
      });
      setNotification({
        type: 'success',
        message: '💡 Hint Pass purchased! Added to inventory.'
      });
      if (onTeamUpdated) onTeamUpdated(res.team);
    } catch (err) {
      setNotification({ type: 'error', message: err.message || 'Failed to purchase Hint Pass.' });
    } finally {
      setLoadingHint(false);
    }
  };

  const handleUseHintPassOnProblem = async (problemId) => {
    if (!problemId) return;
    setLoadingHint(true);
    setNotification(null);
    try {
      const res = await useHintPass({
        teamName: team.name,
        memberId: currentMember?.memberId,
        problemId
      });
      setNotification({
        type: 'success',
        message: `💡 Algorithmic Hint unlocked for "${problemId}"! Visible to all team members.`
      });
      setShowHintModal(false);
      setSelectedHintProblemId('');
      if (onTeamUpdated) onTeamUpdated(res.team);
      if (onOpenProblem) onOpenProblem(problemId);
    } catch (err) {
      setNotification({ type: 'error', message: err.message || 'Failed to reveal hint.' });
    } finally {
      setLoadingHint(false);
    }
  };

  const handlePurchaseSabotage = async () => {
    if (!canAfford) {
      setNotification({
        type: 'error',
        message: 'Insufficient balance to purchase Sabotage Card.'
      });
      return;
    }

    setLoadingSabotage(true);
    setNotification(null);
    try {
      const res = await purchaseSabotageCard({
        teamName: team.name,
        memberId: currentMember?.memberId
      });
      setNotification({
        type: 'success',
        message: '⚡ Sabotage Card purchased! Added to inventory.'
      });
      if (onTeamUpdated) onTeamUpdated(res.team);
    } catch (err) {
      setNotification({ type: 'error', message: err.message || 'Failed to purchase Sabotage Card.' });
    } finally {
      setLoadingSabotage(false);
    }
  };

  return (
    <section style={{ marginBottom: '32px' }}>
      {/* Section Subheader */}
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: 700,
            color: '#0f172a',
            letterSpacing: '0.2px'
          }}>
            Power Cards
          </h2>
          <span style={{
            fontSize: '11px',
            color: '#64748b',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            padding: '1px 8px',
            borderRadius: '12px',
            fontWeight: 500
          }}>
            Shared Inventory
          </span>
        </div>

        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Shared Balance: <b style={{ color: '#0f172a', fontFamily: 'var(--font-mono)' }}>{teamBalance} ByteCoins</b>
        </div>
      </div>

      {/* Global Card Notification */}
      {notification && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          background: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: notification.type === 'success' ? '#047857' : '#b91c1c',
          fontSize: '13px',
          fontWeight: 500,
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Grid: 2 Distinct Hero Power Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {/* ============================================================ */}
        {/* 1. BLUE — HINT PASS                                          */}
        {/* ============================================================ */}
        <div
          className={recentUnlockedCard === 'HINT' ? 'card-unlocked-reveal' : ''}
          style={{
            background: isHintUnlocked ? '#ffffff' : '#f8fafc',
            border: `1px solid ${isHintUnlocked ? '#bfdbfe' : '#e2e8f0'}`,
            borderRadius: '14px',
            padding: '24px 22px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: isHintUnlocked ? 'space-between' : 'center',
            minHeight: '210px',
            boxShadow: isHintUnlocked ? '0 4px 14px rgba(37, 99, 235, 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.05)',
            transition: 'border-color 0.2s ease, transform 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#93c5fd';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isHintUnlocked ? '#bfdbfe' : '#e2e8f0';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {!isHintUnlocked ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '30px 16px',
              gap: '14px'
            }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '12px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.12)'
              }}>
                <Lock size={24} />
              </div>

              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '0.2px'
              }}>
                Hint Pass
              </h3>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#64748b',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                padding: '5px 14px',
                borderRadius: '20px'
              }}>
                <Lock size={12} />
                <span>Locked</span>
              </div>
            </div>
          ) : (
            <>
              <div>
                {/* Top Row: Icon + Inventory Tag */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb'
                  }}>
                    <Lightbulb size={22} />
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: hintPassesCount > 0 ? '#2563eb' : '#94a3b8',
                    background: hintPassesCount > 0 ? '#eff6ff' : '#f1f5f9',
                    border: `1px solid ${hintPassesCount > 0 ? '#bfdbfe' : '#e2e8f0'}`,
                    padding: '3px 10px',
                    borderRadius: '12px'
                  }}>
                    {hintPassesCount} Available
                  </span>
                </div>

                {/* Title & Subtitle */}
                <h3 style={{
                  margin: '0 0 4px',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '0.2px'
                }}>
                  Hint Pass
                </h3>
                <div style={{
                  fontSize: '13px',
                  color: '#64748b',
                  marginBottom: '16px'
                }}>
                  Strategic assistance
                </div>
              </div>

              {/* Action Row */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {hintPassesCount > 0 ? (
                  <>
                    <button
                      type="button"
                      className="btn-blue"
                      onClick={() => setShowHintModal(true)}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        fontSize: '13px',
                        borderRadius: '8px',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 600
                      }}
                    >
                      <Check size={14} /> Use Hint
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handlePurchaseHintPass}
                      disabled={loadingHint || !canAfford}
                      style={{
                        padding: '9px 14px',
                        fontSize: '13px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        color: '#334155'
                      }}
                      title="Purchase additional Hint Pass"
                    >
                      + Buy
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-blue"
                    onClick={handlePurchaseHintPass}
                    disabled={loadingHint || !canAfford}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      background: canAfford ? '#2563eb' : '#f1f5f9',
                      color: canAfford ? '#ffffff' : '#94a3b8',
                      border: canAfford ? 'none' : '1px solid #e2e8f0',
                      fontWeight: 600
                    }}
                  >
                    {loadingHint ? 'Purchasing...' : canAfford ? 'Purchase' : 'Unavailable'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ============================================================ */}
        {/* 2. RED — SABOTAGE CARD                                       */}
        {/* ============================================================ */}
        <div
          className={recentUnlockedCard === 'SABOTAGE' ? 'card-unlocked-reveal' : ''}
          style={{
            background: isSabotageUnlocked ? '#ffffff' : '#f8fafc',
            border: `1px solid ${isSabotageUnlocked ? '#fecdd3' : '#e2e8f0'}`,
            borderRadius: '14px',
            padding: '24px 22px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: isSabotageUnlocked ? 'space-between' : 'center',
            minHeight: '210px',
            boxShadow: isSabotageUnlocked ? '0 4px 14px rgba(225, 29, 72, 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.05)',
            transition: 'border-color 0.2s ease, transform 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#fda4af';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = isSabotageUnlocked ? '#fecdd3' : '#e2e8f0';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {!isSabotageUnlocked ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '30px 16px',
              gap: '14px'
            }}>
              <div style={{
                width: '50px',
                height: '50px',
                borderRadius: '12px',
                background: '#fff1f2',
                border: '1px solid #fecdd3',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e11d48',
                boxShadow: '0 2px 8px rgba(225, 29, 72, 0.12)'
              }}>
                <Lock size={24} />
              </div>

              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '0.2px'
              }}>
                Sabotage Card
              </h3>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#64748b',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                padding: '5px 14px',
                borderRadius: '20px'
              }}>
                <Lock size={12} />
                <span>Locked</span>
              </div>
            </div>
          ) : (
            <>
              <div>
                {/* Top Row: Icon + Inventory Tag */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: '#fff1f2',
                    border: '1px solid #fecdd3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#e11d48'
                  }}>
                    <Zap size={22} />
                  </div>

                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: sabotageCardsCount > 0 ? '#e11d48' : '#94a3b8',
                    background: sabotageCardsCount > 0 ? '#fff1f2' : '#f1f5f9',
                    border: `1px solid ${sabotageCardsCount > 0 ? '#fecdd3' : '#e2e8f0'}`,
                    padding: '3px 10px',
                    borderRadius: '12px'
                  }}>
                    {sabotageCardsCount} Available
                  </span>
                </div>

                {/* Title & Subtitle */}
                <h3 style={{
                  margin: '0 0 4px',
                  fontSize: '18px',
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '0.2px'
                }}>
                  Sabotage Card
                </h3>
                <div style={{
                  fontSize: '13px',
                  color: '#64748b',
                  marginBottom: '16px'
                }}>
                  Freeze rival workspace
                </div>
              </div>

              {/* Action Row */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                {sabotageCardsCount > 0 ? (
                  <>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => setShowSabotageModal(true)}
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        fontSize: '13px',
                        borderRadius: '8px',
                        background: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        fontWeight: 600
                      }}
                    >
                      <Zap size={14} /> Use Sabotage
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handlePurchaseSabotage}
                      disabled={loadingSabotage || !canAfford}
                      style={{
                        padding: '9px 14px',
                        fontSize: '13px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        color: '#334155'
                      }}
                      title="Purchase additional Sabotage Card"
                    >
                      + Buy
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn-danger"
                    onClick={handlePurchaseSabotage}
                    disabled={loadingSabotage || !canAfford}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      fontSize: '13px',
                      borderRadius: '8px',
                      background: canAfford ? '#ef4444' : '#f1f5f9',
                      color: canAfford ? '#ffffff' : '#94a3b8',
                      border: canAfford ? 'none' : '1px solid #e2e8f0',
                      fontWeight: 600
                    }}
                  >
                    {loadingSabotage ? 'Purchasing...' : canAfford ? 'Purchase' : 'Unavailable'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sabotage Target Modal */}
      {showSabotageModal && (
        <SabotageTargetModal
          team={team}
          currentMember={currentMember}
          onClose={() => setShowSabotageModal(false)}
          onSabotageSuccess={(res) => {
            if (onTeamUpdated && res.attackingTeam) {
              onTeamUpdated(res.attackingTeam);
            }
          }}
        />
      )}

      {/* Pick Problem for Hint Modal */}
      {showHintModal && (
        <div className="ov" style={{ zIndex: 1000 }}>
          <div className="box" style={{ maxWidth: '480px', width: '92%', background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lightbulb size={20} color="#2563eb" />
                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '17px', fontWeight: 700 }}>
                  Select Problem for Hint
                </h3>
              </div>
              <button className="btn-ghost" onClick={() => setShowHintModal(false)} style={{ padding: '6px' }}>
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.5 }}>
              Choose which unlocked problem to reveal the official algorithmic hint for. The hint is shared instantly with all team members.
            </p>

            {unlockedWithoutHints.length === 0 ? (
              <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#64748b',
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px dashed #cbd5e1',
                fontSize: '13px',
                marginBottom: '16px'
              }}>
                {unlockedProblems.length === 0
                  ? 'Your team has not unlocked any problems yet. Unlock a problem first before using a Hint Pass.'
                  : 'All your currently unlocked problems already have their hints revealed!'}
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>
                  Target Problem
                </label>
                <select
                  value={selectedHintProblemId}
                  onChange={(e) => setSelectedHintProblemId(e.target.value)}
                  style={{
                    fontSize: '13px',
                    padding: '10px 12px',
                    width: '100%',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    borderRadius: '8px'
                  }}
                >
                  <option value="">-- Choose an unlocked problem --</option>
                  {unlockedWithoutHints.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} — {p.title} ({p.diff})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-ghost" onClick={() => setShowHintModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-blue"
                onClick={() => handleUseHintPassOnProblem(selectedHintProblemId)}
                disabled={loadingHint || !selectedHintProblemId}
                style={{ padding: '8px 16px', borderRadius: '6px', background: '#2563eb', color: '#ffffff', border: 'none', fontWeight: 600 }}
              >
                {loadingHint ? 'Revealing...' : 'Reveal Hint'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
