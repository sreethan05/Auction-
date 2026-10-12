import React from 'react';
import { Shield, CheckCircle2 } from 'lucide-react';

/**
 * Team's wild card inventory — read-only. All wild cards are bought via
 * OFFLINE bidding recorded by the organizer, so there is nothing to purchase
 * here. Teams see what they own, which defenses are armed, and what is live.
 */
export function WildCardInventory({ team, effects = [], armedDefenses = [], serverTime = 0 }) {
  const inventory = team?.inventory || [];
  const balance = team?.balance ?? 1000;

  const now = Date.now();
  const offset = serverTime ? serverTime - now : 0;
  const activeOnUs = effects.filter(e => e.endsAt ? (e.endsAt - (now + offset)) > 0 : true);

  return (
    <section style={{ marginBottom: '28px' }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: '14px', flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
            Wild Card Inventory
          </h2>
          <span style={{
            fontSize: '11px', color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0',
            padding: '1px 8px', borderRadius: '12px', fontWeight: 500
          }}>
            Bought via offline auction — organizer records every bid
          </span>
        </div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          Shared Balance: <b style={{ color: '#0f172a', fontFamily: 'var(--font-mono)' }}>{balance} ByteCoins</b>
        </div>
      </div>

      {activeOnUs.length > 0 && (
        <div style={{
          display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px'
        }}>
          {activeOnUs.map(e => (
            <span key={e.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c',
              fontSize: '12px', fontWeight: 700, borderRadius: '8px', padding: '5px 12px'
            }}>
              {e.icon} {e.name}{e.endsAt ? ` · ${Math.max(0, Math.ceil((e.endsAt - (now + offset)) / 1000))}s left` : ''}
            </span>
          ))}
        </div>
      )}

      {armedDefenses.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {armedDefenses.map(a => (
            <span key={a.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8',
              fontSize: '12px', fontWeight: 700, borderRadius: '8px', padding: '5px 12px'
            }}>
              <Shield size={12} /> {a.name} ARMED — blocks the next attack
            </span>
          ))}
        </div>
      )}

      {inventory.length === 0 ? (
        <div style={{
          padding: '18px 20px', textAlign: 'center', color: '#64748b',
          background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '10px', fontSize: '13px'
        }}>
          No wild cards yet. Wild cards are auctioned OFFLINE — if your team wins a bid,
          the organizer records it here and the card appears in this inventory.
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px'
        }}>
          {inventory.map(card => (
            <div key={card.id} style={{
              background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
              padding: '14px 16px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '20px' }}>{card.icon}</span>
                <span style={{
                  fontSize: '10px', fontWeight: 800, letterSpacing: '0.6px',
                  color: card.kind === 'ATTACK' ? '#e11d48' : card.kind === 'DEFENSE' ? '#2563eb' : '#059669',
                  background: card.kind === 'ATTACK' ? '#fff1f2' : card.kind === 'DEFENSE' ? '#eff6ff' : '#ecfdf5',
                  border: `1px solid ${card.kind === 'ATTACK' ? '#fecdd3' : card.kind === 'DEFENSE' ? '#bfdbfe' : '#a7f3d0'}`,
                  borderRadius: '4px', padding: '2px 7px'
                }}>
                  {card.kind}
                </span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{card.name}</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px', lineHeight: 1.45 }}>
                {card.description}
              </div>
              <div style={{ marginTop: '8px', fontSize: '11px', fontWeight: 700, color: card.armed ? '#2563eb' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                {card.armed ? (
                  <><Shield size={11} /> ARMED</>
                ) : card.bidAmount !== null && card.bidAmount !== undefined ? (
                  <>Paid {card.bidAmount} BC</>
                ) : (
                  <>Owned</>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hint reveals shared with the team */}
      {team?.revealedHints && Object.keys(team.revealedHints).length > 0 && (
        <div style={{ marginTop: '14px', fontSize: '12px', color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <CheckCircle2 size={14} />
          {Object.keys(team.revealedHints).length} hint{Object.keys(team.revealedHints).length !== 1 ? 's' : ''} revealed — visible inside each unlocked problem.
        </div>
      )}
    </section>
  );
}
