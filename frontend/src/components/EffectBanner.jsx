import React, { useState, useEffect } from 'react';

function fmt(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Live strip of active sabotage effects on this team (server-timed, survives refresh).
 * effects: [{ id, cardId, name, icon, endsAt, remainingSeconds, byTeam, lang }]
 */
export function EffectBanner({ effects = [], serverTime = 0 }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const offset = serverTime ? serverTime - Date.now() : 0;

  if (!effects.length) return null;

  return (
    <div style={{
      display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center',
      padding: '8px 24px', background: '#0f172a', color: '#f8fafc'
    }}>
      <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '1px', color: '#94a3b8' }}>
        ACTIVE EFFECTS
      </span>
      {effects.map(e => {
        const left = e.endsAt ? (e.endsAt - (now + offset)) : null;
        return (
          <span
            key={e.id}
            title={`${e.name} played by ${e.byTeam || 'a rival team'}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              background: 'rgba(225, 29, 72, 0.15)', border: '1px solid rgba(225, 29, 72, 0.5)',
              borderRadius: '8px', padding: '4px 12px', fontSize: '12.5px', fontWeight: 700
            }}
          >
            <span style={{ fontSize: '14px' }}>{e.icon}</span>
            {e.name.toUpperCase()}
            {e.lang && <span style={{ color: '#fbbf24' }}>({e.lang.toUpperCase()})</span>}
            {left !== null && left > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', color: '#fda4af' }}>{fmt(left)}</span>
            )}
            {left === null && (
              <span style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 800 }}>UNTIL NEXT SOLVE</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
