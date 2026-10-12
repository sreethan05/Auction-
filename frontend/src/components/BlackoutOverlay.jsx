import React, { useState, useEffect } from 'react';

function fmt(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Blackout wild card: full-screen black overlay. The team's code keeps running
 * server-side — this only blinds the screen. Countdown is server-timed.
 */
export function BlackoutOverlay({ endsAt, serverTime = 0 }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  if (!endsAt) return null;
  const offset = serverTime ? serverTime - Date.now() : 0;
  const left = endsAt - (now + offset);
  if (left <= 0) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9900,
      background: '#000000', color: '#f8fafc',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      userSelect: 'none', gap: '14px', padding: '24px'
    }}>
      <div style={{ fontSize: '52px' }}>🌑</div>
      <div style={{
        fontSize: '13px', fontWeight: 800, letterSpacing: '3px', color: '#facc15', textTransform: 'uppercase'
      }}>
        Blackout — Blind Bidding
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '52px', fontWeight: 800, letterSpacing: '3px' }}>
        {fmt(left)}
      </div>
      <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', lineHeight: 1.6, maxWidth: '420px' }}>
        Your screen has been blinded by a rival team's wild card.<br />
        Your code is still running and submissions are still allowed — but you cannot see anything until the timer ends.
      </div>
    </div>
  );
}
