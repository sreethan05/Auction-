import React, { useState, useEffect } from 'react';
import { Trophy, ShieldAlert, CheckCircle2, Coins, Settings, BarChart2, Maximize, Crown, Users, Receipt, Flag, Shield, Clock, Snowflake } from 'lucide-react';

function fmtCountdown(ms) {
  if (ms <= 0) return "TIME'S UP";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export function Header({ team, currentMember, eventSettings, onOpenLeaderboard, onOpenTransactions, onToggleFullscreen }) {
  const flagsCount = team?.violations?.length || 0;
  const isHighRisk = flagsCount >= 3;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const offset = eventSettings?.serverTime ? eventSettings.serverTime - Date.now() : 0;
  // Time Steal wild card shifts this team's personal clock (± minutes)
  const teamDeltaMs = (team?.timeDeltaSeconds || 0) * 1000;
  const remaining = eventSettings?.endAt ? (eventSettings.endAt - (now + offset)) + teamDeltaMs : null;
  const isTeamFrozen = Boolean(team?.frozenUntil && team.frozenUntil > now + 0);

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      minHeight: '56px',
      flexWrap: 'wrap',
      gap: '16px',
      zIndex: 50
    }}>
      {/* Left: THE AUCTIONEER Brand + Team Workspace identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '9px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '16px',
            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
            userSelect: 'none'
          }}>
            A
          </div>
          <div>
            <div style={{
              fontSize: '15px',
              fontWeight: 800,
              letterSpacing: '0.3px',
              color: '#0f172a',
              lineHeight: 1.1
            }}>
              THE AUCTIONEER
            </div>
            <div style={{
              fontSize: '9.5px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              color: '#7c3aed',
              textTransform: 'uppercase',
              lineHeight: 1
            }}>
              DSA ASSESSMENT
            </div>
          </div>
        </div>

        {/* Subtle Divider */}
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0' }} />

        {/* Small Team & Member Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span style={{
            color: '#0f172a',
            fontWeight: 700,
            letterSpacing: '0.3px',
            padding: '2px 8px',
            borderRadius: '4px',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0'
          }}>
            {team?.name || 'GUEST'}
          </span>

          {currentMember && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
              <span>•</span>
              {currentMember.isCaptain && (
                <Crown size={12} color="#f59e0b" title="Team Leader" style={{ flexShrink: 0 }} />
              )}
              <span style={{ color: '#334155', fontWeight: 600 }}>{currentMember.name}</span>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>({currentMember.memberId})</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Essential Stats + Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        {/* Simple Text + Icons Stats Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '13px' }}>
          {/* ByteCoins */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Team Shared ByteCoins Balance">
            <Coins size={15} color="#4f46e5" />
            <b style={{ color: '#0f172a', fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
              {team?.balance ?? 1000}
            </b>
            <span style={{ color: '#64748b', fontSize: '12px' }}>ByteCoins</span>
          </div>

          <span style={{ color: '#cbd5e1' }}>•</span>

          {/* Points */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Leaderboard Contest Points">
            <Trophy size={15} color="#7c3aed" />
            <b style={{ color: '#0f172a', fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
              {team?.score || 0}
            </b>
            <span style={{ color: '#64748b', fontSize: '12px' }}>Points</span>
          </div>

          <span style={{ color: '#cbd5e1' }}>•</span>

          {/* Solved */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Problems Solved">
            <CheckCircle2 size={15} color="#10b981" />
            <b style={{ color: '#0f172a', fontFamily: 'var(--font-mono)', fontSize: '14px' }}>
              {team?.solved?.length || 0}
            </b>
            <span style={{ color: '#64748b', fontSize: '12px' }}>Solved</span>
          </div>

          {/* Flags */}
          {flagsCount > 0 && (
            <>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                color: isHighRisk ? '#ef4444' : '#64748b'
              }} title="Integrity violations logged">
                <Flag size={14} color={isHighRisk ? '#ef4444' : '#64748b'} />
                <span style={{ fontWeight: 600, fontSize: '12px' }}>
                  {flagsCount} Flags
                </span>
              </div>
            </>
          )}

          {/* Frozen by sabotage */}
          {isTeamFrozen && (
            <>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#0284c7' }} title="Team frozen by a wild card">
                <Snowflake size={14} />
                <span style={{ fontWeight: 700, fontSize: '12px' }}>Frozen</span>
              </div>
            </>
          )}

          {/* Event countdown */}
          {remaining !== null && (
            <>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                title="Event time remaining (server clock)"
              >
                <Clock size={15} color={remaining <= 20 * 60 * 1000 ? '#ef4444' : '#7c3aed'} />
                <b style={{
                  color: remaining <= 5 * 60 * 1000 ? '#ef4444' : (remaining <= 20 * 60 * 1000 ? '#d97706' : '#0f172a'),
                  fontFamily: 'var(--font-mono)', fontSize: '14px'
                }}>
                  {fmtCountdown(remaining)}
                </b>
                <span style={{ color: '#64748b', fontSize: '12px' }}>left</span>
              </div>
            </>
          )}
        </div>

        {/* Subtle Divider */}
        <div style={{ width: '1px', height: '18px', background: '#e2e8f0' }} />

        {/* Clean Action Icons / Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onOpenTransactions && (
            <button
              className="btn-ghost"
              onClick={onOpenTransactions}
              title="View Team Purchases & Invoices"
              style={{ fontSize: '12px', padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}
            >
              <Receipt size={14} /> Purchases
            </button>
          )}
          <button
            className="btn-ghost"
            onClick={onOpenLeaderboard}
            title="View Live Leaderboard"
            style={{ fontSize: '12px', padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          >
            <BarChart2 size={14} /> Leaderboard
          </button>
          <button
            className="btn-ghost"
            onClick={onToggleFullscreen}
            title="Toggle Fullscreen"
            style={{ padding: '6px', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          >
            <Maximize size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
