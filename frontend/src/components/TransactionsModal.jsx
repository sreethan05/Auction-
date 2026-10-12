import React from 'react';
import { X, Receipt } from 'lucide-react';

export function TransactionsModal({ team, onClose }) {
  const transactions = team?.transactions || [];
  const totalSpent = transactions.reduce((acc, t) => acc + (Number(t.bidAmount || t.price) || 0), 0);

  return (
    <div className="ov" style={{ zIndex: 1000, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
      <div className="box" style={{ maxWidth: '680px', width: '95%', padding: '24px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={20} color="#7c3aed" />
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px', fontWeight: 800 }}>
              Purchase & Winning Bid History
            </h3>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px', color: '#64748b' }}>
            <X size={16} />
          </button>
        </div>

        {/* Summary Card */}
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: '#64748b' }}>
              Team: <b style={{ color: '#0f172a' }}>{team?.name}</b>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Remaining Budget: <b style={{ color: '#2563eb', fontFamily: 'var(--font-mono)' }}>{team?.balance ?? 1000} ByteCoins</b>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
              Total Bids Spent
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626', fontFamily: 'var(--font-mono)' }}>
              {totalSpent} BC
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Problem</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Winning Bid</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Bidder</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Remaining</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '11px 14px', color: '#0f172a', fontWeight: 600 }}>
                    <b style={{ color: '#2563eb' }}>{t.problemId}</b> — {t.problemTitle}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#2563eb', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {t.bidAmount || t.price} BC
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ color: '#475569', fontWeight: 600 }}>{t.purchasedBy}</span>
                    {t.purchasedByName && (
                      <small style={{ color: '#64748b', marginLeft: '6px' }}>({t.purchasedByName})</small>
                    )}
                  </td>
                  <td style={{ padding: '11px 14px', color: '#059669', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {t.remainingBalance !== undefined ? `${t.remainingBalance} BC` : '-'}
                  </td>
                  <td style={{ padding: '11px 14px', textAlign: 'right', color: '#94a3b8', fontSize: '12px' }}>
                    {t.displayTime || new Date(t.purchaseTime).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                    No recorded winning bids yet.
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
