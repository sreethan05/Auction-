import React, { useState } from 'react';
import { Lock, X, KeyRound, Ban, CheckCircle2, Sparkles } from 'lucide-react';
import { WildCardInventory } from './WildCardInventory';
import { PinUnlockModal } from './PinUnlockModal';

/**
 * Participant home: unlocked problems (full detail via Solve) plus the FULL
 * auction catalog in LOCKED form — every other problem shows ONLY its
 * difficulty and points (B2). Descriptions unlock per-team via PIN/direct.
 */
export function ProblemCatalog({
  problems = [],
  problemPrices, // eslint-disable-line no-unused-vars
  unlockedIds = [],
  solvedIds = [],
  problemStatuses = {},
  teamBalance = 1000, // eslint-disable-line no-unused-vars
  currentMember,
  team,
  onTeamUpdated,
  onSelectProblem,
  eventSettings = null
}) {
  const [notification, setNotification] = useState(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogDiff, setCatalogDiff] = useState('ALL');

  const wildCardsClosed = Boolean(eventSettings?.wildCardsClosed);
  const unlockedSet = new Set(unlockedIds);
  const myProblems = unlockedIds
    .map(id => problems.find(p => p.id === id))
    .filter(Boolean);
  const lockedProblems = (problems || [])
    .filter(p => !unlockedSet.has(p.id))
    .filter(p => {
      const q = catalogSearch.trim().toLowerCase();
      if (q && !(`${p.id} ${p.title} ${p.cat || ''}`.toLowerCase().includes(q))) return false;
      if (catalogDiff !== 'ALL' && (p.diff || '').toUpperCase() !== catalogDiff) return false;
      return true;
    });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
      <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
        {/* Global Notification Banner */}
        {notification && (
          <div style={{
            padding: '12px 18px',
            borderRadius: '8px',
            marginBottom: '20px',
            background: notification.success ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
            border: `1px solid ${notification.success ? 'rgba(63, 185, 80, 0.3)' : 'rgba(248, 81, 73, 0.3)'}`,
            color: notification.success ? '#3fb950' : '#f85149',
            fontWeight: 500,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>{notification.text}</span>
            <button
              onClick={() => setNotification(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Wild cards closed banner (last 20 minutes) */}
        {wildCardsClosed && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '11px 16px', borderRadius: '10px', marginBottom: '20px',
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
            fontSize: '13px', fontWeight: 700
          }}>
            <Ban size={15} />
            WILD CARDS CLOSED — no wild card activity in the last 20 minutes of the event.
          </div>
        )}

        {/* 1. HERO SECTION: Team Wild Card Inventory (bought via offline auction) */}
        <WildCardInventory
          team={team}
          effects={team?.effects || []}
          armedDefenses={team?.armedDefenses || []}
          serverTime={eventSettings?.serverTime || 0}
        />

        {/* 2. MY PROBLEMS — only what the organizer unlocked for this team */}
        <section>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '14px', flexWrap: 'wrap', gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                My Problems
              </h2>
              <span style={{
                fontSize: '11px', color: '#64748b', background: '#f1f5f9',
                border: '1px solid #e2e8f0', padding: '1px 8px', borderRadius: '12px', fontWeight: 500
              }}>
                Unlocked for {team?.name || 'your team'} via the auction
              </span>
            </div>

            <button
              className="btn-ghost"
              onClick={() => setShowPinModal(true)}
              title="Enter the PIN the organizers gave your team"
              style={{
                fontSize: '12px', padding: '7px 14px', borderRadius: '8px', fontWeight: 700,
                color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe',
                display: 'inline-flex', alignItems: 'center', gap: '6px'
              }}
            >
              <KeyRound size={13} /> Redeem PIN
            </button>
          </div>

          {myProblems.length === 0 ? (
            <div style={{
              padding: '42px 24px', textAlign: 'center',
              background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px'
            }}>
              <Lock size={26} color="#94a3b8" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                No problems unlocked yet
              </div>
              <div style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.6, maxWidth: '480px', margin: '0 auto' }}>
                When your team wins the auction, the organizer unlocks that problem for you
                and it appears here instantly. If they hand you a PIN instead, hit
                <b> Redeem PIN</b> above.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {myProblems.map((prob) => {
                const isSolved = solvedIds.includes(prob.id);
                const statusInfo = problemStatuses[prob.id];
                const wrongCount = team?.problemWrong?.[prob.id] ?? statusInfo?.wrongSubmissions ?? 0;
                const points = prob.pts || (prob.diff === 'Hard' ? 400 : (prob.diff === 'Medium' ? 300 : 200));

                return (
                  <div
                    key={prob.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px 18px', background: '#ffffff',
                      border: `1px solid ${isSolved ? '#a7f3d0' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isSolved ? '#ecfdf5' : '#f5f3ff',
                        border: `1px solid ${isSolved ? '#a7f3d0' : '#ddd6fe'}`,
                        color: isSolved ? '#059669' : '#7c3aed'
                      }}>
                        {isSolved ? <CheckCircle2 size={20} /> : <Sparkles size={18} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: '15px', fontWeight: 700,
                          color: isSolved ? '#047857' : '#0f172a'
                        }}>
                          {prob.id} &nbsp;{prob.title}
                        </div>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          fontSize: '12px', color: '#64748b', marginTop: '4px', flexWrap: 'wrap'
                        }}>
                          <span style={{
                            fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
                            background: prob.diff === 'Hard' ? '#fff1f2' : (prob.diff === 'Medium' ? '#fffbeb' : '#ecfdf5'),
                            color: prob.diff === 'Hard' ? '#be123c' : (prob.diff === 'Medium' ? '#b45309' : '#047857'),
                            border: `1px solid ${prob.diff === 'Hard' ? '#fecdd3' : (prob.diff === 'Medium' ? '#fde68a' : '#a7f3d0')}`
                          }}>
                            {prob.diff}
                          </span>
                          <span style={{ color: '#cbd5e1' }}>•</span>
                          <span style={{ color: '#475569', fontWeight: 600 }}>{points} pts</span>

                          {isSolved && statusInfo?.solvedByName && (
                            <>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ color: '#059669', fontWeight: 600 }}>
                                ✓ Solved by {statusInfo.solvedByName}
                              </span>
                            </>
                          )}
                          {!isSolved && statusInfo?.status === 'IN_PROGRESS' && statusInfo.workingBy !== currentMember?.memberId && (
                            <>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ color: '#d97706', fontWeight: 600 }}>
                                ● Teammate {statusInfo.workingByName || statusInfo.workingBy} is working on this
                              </span>
                            </>
                          )}
                          {wrongCount > 0 && !isSolved && (
                            <>
                              <span style={{ color: '#cbd5e1' }}>•</span>
                              <span style={{ color: '#dc2626', fontWeight: 600 }}>
                                {wrongCount} failed attempt{wrongCount !== 1 ? 's' : ''} (−{wrongCount * 10} pts)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <button
                        className="btn-primary"
                        onClick={() => onSelectProblem(prob.id)}
                        style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 600, borderRadius: '8px' }}
                      >
                        {isSolved ? 'Review Solution →' : 'Solve Problem →'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. LOCKED AUCTION CATALOG — all problems, locked by default.
            Locked rows expose ONLY difficulty + points (no description). */}
        <section style={{ marginTop: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Auction Catalog
              </h2>
              <span style={{
                fontSize: '11px', color: '#64748b', background: '#f1f5f9',
                border: '1px solid #e2e8f0', padding: '1px 8px', borderRadius: '12px', fontWeight: 500
              }}>
                {lockedProblems.length} locked · difficulty + points only
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                placeholder="Search locked problems..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', minWidth: '180px' }}
              />
              <select
                value={catalogDiff}
                onChange={(e) => setCatalogDiff(e.target.value)}
                style={{ fontSize: '12px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none' }}
              >
                <option value="ALL">All levels</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
          </div>
          {lockedProblems.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', fontSize: '12.5px', color: '#64748b' }}>
              No locked problems match this filter — or your team has unlocked everything.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {lockedProblems.slice(0, 60).map((prob) => {
                const points = prob.pts || (prob.diff === 'Hard' ? 400 : (prob.diff === 'Medium' ? 300 : 200));
                return (
                  <div
                    key={prob.id}
                    title="Locked — win the offline auction or redeem the PIN to unlock"
                    style={{
                      padding: '14px 16px', background: '#ffffff',
                      border: '1px solid #e2e8f0', borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <Lock size={14} color="#94a3b8" />
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>{prob.id}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '4px',
                        background: prob.diff === 'Hard' ? '#fff1f2' : (prob.diff === 'Medium' ? '#fffbeb' : '#ecfdf5'),
                        color: prob.diff === 'Hard' ? '#be123c' : (prob.diff === 'Medium' ? '#b45309' : '#047857'),
                        border: `1px solid ${prob.diff === 'Hard' ? '#fecdd3' : (prob.diff === 'Medium' ? '#fde68a' : '#a7f3d0')}`
                      }}>
                        {prob.diff}
                      </span>
                      <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>{points} pts</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
                      🔒 Locked — details hidden until your team unlocks it.
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {lockedProblems.length > 60 && (
            <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '8px' }}>
              Showing 60 of {lockedProblems.length} locked problems — use search to narrow down.
            </div>
          )}
        </section>
      </div>

      {/* PIN Redeem Modal */}
      {showPinModal && (
        <PinUnlockModal
          team={team}
          currentMember={currentMember}
          onClose={() => setShowPinModal(false)}
          onUnlocked={(unlockedTeam, problem) => {
            if (onTeamUpdated && unlockedTeam) onTeamUpdated(unlockedTeam);
            setNotification({
              success: true,
              text: `🔓 Unlocked ${problem.id} — ${problem.title}!`
            });
          }}
        />
      )}
    </div>
  );
}
