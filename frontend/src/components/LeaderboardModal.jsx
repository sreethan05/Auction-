import React, { useState, useEffect } from 'react';
import { Trophy, X, Snowflake, Ban } from 'lucide-react';
import { fetchLeaderboard } from '../services/api';

export function LeaderboardModal({ onClose }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [frozen, setFrozen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchLeaderboard();
      setLeaderboard(data.leaderboard || []);
      setFrozen(Boolean(data.frozen));
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="ov" style={{ zIndex: 950, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="box" style={{ maxWidth: '640px', padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={20} color="#7c3aed" />
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: '18px', fontWeight: 800 }}>
              Live Contest Leaderboard
            </h2>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px', color: '#64748b' }}>
            <X size={16} />
          </button>
        </div>

        {/* Frozen banner */}
        {frozen && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
            padding: '10px 14px', marginBottom: '14px', color: '#b45309', fontSize: '12.5px', fontWeight: 700
          }}>
            <Ban size={14} /> LEADERBOARD FROZEN by the organizers — standings shown are from freeze time.
          </div>
        )}

        {/* Scoring Rules Strip */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#64748b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '6px'
        }}>
          <div>
            <span style={{ fontWeight: 600 }}>Formula: Solved Pts − Penalties + (Coins ÷ 10)</span>
          </div>
          <div style={{ color: '#dc2626', fontWeight: 700 }}>
            −10 pts per Wrong Submission
          </div>
        </div>

        <div style={{
          maxHeight: '440px',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '10px'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 14px', width: '60px', fontWeight: 700 }}>Rank</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Team</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Solved</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>Wrong (WA)</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>ByteCoins</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Final Score</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((team, idx) => {
                const rank = idx + 1;
                const coins = team.balance ?? 1000;
                const coinBonus = team.coinBonus ?? Math.round(coins / 10);
                return (
                  <tr key={team.name} style={{
                    borderBottom: '1px solid #f1f5f9',
                    background: rank === 1 ? '#eff6ff' : 'transparent'
                  }}>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: rank === 1 ? '#d97706' : '#64748b' }}>
                      #{rank}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      {team.name}
                      {team.isFrozen && (
                        <span title="Frozen by a wild card" style={{ color: '#0284c7', marginLeft: '6px', display: 'inline-flex', alignItems: 'center' }}>
                          <Snowflake size={13} />
                        </span>
                      )}
                      {team.isLocked && <span style={{ color: '#dc2626', fontSize: '11px', marginLeft: '6px' }}>(Locked)</span>}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#059669', fontWeight: 700 }}>
                      {team.solvedCount}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#64748b' }}>
                      {team.wrongAttempts}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 600 }}>
                      {coins} <span style={{ fontSize: '11px', color: '#059669' }}>(+{coinBonus})</span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
                      {team.score} pts
                    </td>
                  </tr>
                );
              })}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    No submissions yet. Be the first to solve!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
