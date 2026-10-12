import React, { useState, useEffect } from 'react';
import { Zap, Lock } from 'lucide-react';

export function SabotageFreezeOverlay({ team, onFreezeExpired }) {
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!team?.frozenUntil) return 0;
    return Math.max(0, team.frozenUntil - Date.now());
  });

  useEffect(() => {
    const updateTimer = () => {
      if (!team?.frozenUntil) {
        setRemainingMs(0);
        return;
      }
      const left = Math.max(0, team.frozenUntil - Date.now());
      setRemainingMs(left);
      if (left <= 0 && onFreezeExpired) {
        onFreezeExpired();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [team?.frozenUntil, onFreezeExpired]);

  if (remainingMs <= 0) return null;

  const totalSec = Math.ceil(remainingMs / 1000);
  const minutes = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const seconds = String(totalSec % 60).padStart(2, '0');
  const formattedTime = `${minutes}:${seconds}`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        userSelect: 'none',
        pointerEvents: 'all'
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          background: '#ffffff',
          border: '1px solid #fecdd3',
          borderRadius: '16px',
          padding: '32px 28px',
          textAlign: 'center',
          boxShadow: '0 24px 48px -12px rgba(225, 29, 72, 0.2), 0 10px 20px -5px rgba(0, 0, 0, 0.04)'
        }}
      >
        {/* Pulsing Lightning Icon */}
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '14px',
            background: '#ffe4e6',
            border: '1px solid #fecdd3',
            color: '#e11d48',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}
        >
          <Zap size={28} />
        </div>

        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '1.2px',
          color: '#e11d48',
          textTransform: 'uppercase',
          marginBottom: '4px'
        }}>
          RIVAL POWER CARD TRIGGERED
        </div>

        <h1
          style={{
            fontSize: '26px',
            fontWeight: 800,
            color: '#0f172a',
            margin: '0 0 4px 0',
            letterSpacing: '0.5px'
          }}
        >
          ⚡ SABOTAGED
        </h1>

        <p style={{
          fontSize: '14px',
          color: '#64748b',
          margin: '0 0 20px 0',
          fontWeight: 500
        }}>
          Your screen is frozen
        </p>

        {/* Countdown Timer Display */}
        <div
          style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '20px'
          }}
        >
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#e11d48',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '4px'
          }}>
            Time Remaining
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '44px',
              fontWeight: 800,
              color: '#be123c',
              letterSpacing: '2px'
            }}
          >
            {formattedTime}
          </div>
        </div>

        <p style={{
          fontSize: '12px',
          color: '#64748b',
          lineHeight: 1.5,
          margin: 0
        }}>
          Workspace runs and submissions are temporarily locked. The workspace unlocks automatically when the timer reaches 00:00.
        </p>
      </div>
    </div>
  );
}
