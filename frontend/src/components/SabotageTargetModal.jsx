import React, { useState, useEffect } from 'react';
import { Zap, X, AlertTriangle, RefreshCw, Snowflake, CheckCircle2 } from 'lucide-react';
import { fetchSabotageTargets, useSabotageCard } from '../services/api';

export function SabotageTargetModal({ team, currentMember, onClose, onSabotageSuccess }) {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadTargets = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchSabotageTargets(team?.name || '');
      setTargets(res.targets || []);
    } catch (err) {
      setError(err.message || 'Failed to load active teams.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTargets();
  }, [team?.name]);

  const handleConfirmSabotage = async () => {
    if (!selectedTarget) {
      setError('Please select a target team to sabotage.');
      return;
    }

    if (selectedTarget.isFrozen) {
      setError(`Team "${selectedTarget.name}" is already frozen!`);
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await useSabotageCard({
        teamName: team.name,
        memberId: currentMember?.memberId,
        targetTeamName: selectedTarget.name
      });

      setSuccessMsg(`⚡ Sabotaged Team "${selectedTarget.name}"! Workspace frozen for 5 minutes.`);
      if (onSabotageSuccess) {
        onSabotageSuccess(res);
      }
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err) {
      setError(err.message || 'Failed to activate Sabotage card.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ov" style={{ zIndex: 1000 }}>
      <div
        className="box"
        style={{
          maxWidth: '500px',
          width: '92%',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          padding: '24px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} color="#e11d48" />
            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px', fontWeight: 700 }}>
              Deploy Sabotage Card
            </h3>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '12px',
            marginBottom: '14px',
            fontWeight: 500
          }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#047857',
            fontSize: '12px',
            marginBottom: '14px',
            fontWeight: 500
          }}>
            {successMsg}
          </div>
        )}

        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.5 }}>
          Select rival team to freeze. Their coding workspace will be locked for exactly 5 minutes.
        </p>

        {/* Targets Roster */}
        <div style={{
          maxHeight: '260px',
          overflowY: 'auto',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          background: '#f8fafc',
          marginBottom: '20px'
        }}>
          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              <RefreshCw size={15} className="spin" style={{ display: 'inline', marginRight: '6px' }} />
              Loading rival teams...
            </div>
          ) : targets.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              No rival teams found.
            </div>
          ) : (
            targets.map((tgt) => {
              const isSelected = selectedTarget?.name === tgt.name;
              return (
                <div
                  key={tgt.name}
                  onClick={() => !tgt.isFrozen && setSelectedTarget(tgt)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderBottom: '1px solid #e2e8f0',
                    cursor: tgt.isFrozen ? 'not-allowed' : 'pointer',
                    background: isSelected
                      ? '#fff1f2'
                      : tgt.isFrozen
                      ? '#f1f5f9'
                      : 'transparent',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: isSelected ? '4px solid #e11d48' : '2px solid #cbd5e1',
                      background: '#ffffff',
                      flexShrink: 0
                    }} />

                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
                        {tgt.name}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                        ID: {tgt.teamId}
                      </div>
                    </div>
                  </div>

                  <div>
                    {tgt.isFrozen ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#2563eb',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        <Snowflake size={12} /> Frozen ({tgt.frozenMinutesRemaining}m)
                      </span>
                    ) : (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#047857',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        Playing
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={handleConfirmSabotage}
            disabled={submitting || !selectedTarget || selectedTarget.isFrozen}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              fontWeight: 600
            }}
          >
            {submitting ? 'Freezing...' : 'Freeze Workspace (5 min)'}
          </button>
        </div>
      </div>
    </div>
  );
}
