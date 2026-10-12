import React, { useState } from 'react';
import { ShieldCheck, Maximize2, Search, Check, RefreshCw, AlertCircle, Crown, Lock } from 'lucide-react';
import { getTeamStatus, loginTeam } from '../services/api';

export function GateModal({ onTeamSessionReady }) {
  const [teamInput, setTeamInput] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [forceLogin, setForceLogin] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifiedTeam, setVerifiedTeam] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleVerifyTeam = async () => {
    const trimmed = teamInput.trim().toUpperCase();
    if (!trimmed) {
      setFeedback({ type: 'error', message: 'Please enter your registered Team Name.' });
      return;
    }

    setVerifying(true);
    setFeedback(null);
    setVerifiedTeam(null);
    setSelectedMember(null);

    try {
      const res = await getTeamStatus(trimmed);
      const team = res.team;
      if (!team || !team.members || team.members.length === 0) {
        throw new Error(`Team "${trimmed}" has no registered members in the database.`);
      }
      setVerifiedTeam(team);
    } catch (err) {
      setVerifiedTeam(null);
      setSelectedMember(null);
      setFeedback({
        type: 'error',
        message: err.message || `Team "${trimmed}" not found in registration database.`
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleSelectMember = (member) => {
    setSelectedMember(member);
    if (feedback?.type === 'error') {
      setFeedback(null);
    }
  };

  const handleEnterWorkspace = async () => {
    if (!verifiedTeam) {
      setFeedback({ type: 'error', message: 'Please verify your registered Team Name first.' });
      return;
    }
    if (!selectedMember) {
      setFeedback({ type: 'error', message: 'Please select your identity from the registered team members.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await loginTeam({
        teamName: verifiedTeam.name,
        memberId: selectedMember.memberId,
        password: teamCode,
        force: forceLogin
      });

      onTeamSessionReady(res.team, res.member);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Login failed. Please verify with the proctor.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ov" style={{ zIndex: 999, padding: '16px' }}>
      <div
        className="box"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '28px 24px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
          position: 'relative',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          color: '#0f172a'
        }}
      >
        {/* Top Header Row with Shared Budget Badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '19px',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
              userSelect: 'none'
            }}>
              A
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.2px', lineHeight: 1.1 }}>
                THE AUCTIONEER
              </div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.8px', color: '#7c3aed', textTransform: 'uppercase', marginTop: '2px' }}>
                ASSESSMENT ENTRANCE
              </div>
            </div>
          </div>

          {/* Shared Team Budget Badge */}
          <div style={{
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            borderRadius: '8px',
            padding: '6px 12px',
            textAlign: 'right',
            flexShrink: 0
          }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#6d28d9', textTransform: 'uppercase' }}>
              Team Budget
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
              ₹1,000
            </div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>
              Shared balance
            </div>
          </div>
        </div>

        {/* Step 1: Team Name Verification Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--txt-muted)',
            marginBottom: '6px'
          }}>
            Registered Team Name
          </label>

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="e.g. SYNORA"
              value={teamInput}
              onChange={(e) => {
                setTeamInput(e.target.value.toUpperCase());
                if (verifiedTeam) {
                  setVerifiedTeam(null);
                  setSelectedMember(null);
                }
                if (feedback) setFeedback(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleVerifyTeam();
                }
              }}
              disabled={verifying}
              autoFocus
              style={{
                flex: 1,
                padding: '9px 12px',
                fontSize: '13px',
                fontWeight: 600,
                letterSpacing: '0.5px',
                textTransform: 'uppercase'
              }}
            />

            <button
              type="button"
              onClick={handleVerifyTeam}
              disabled={verifying || !teamInput.trim()}
              className={verifiedTeam ? 'btn-ghost' : 'btn-primary'}
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                whiteSpace: 'nowrap',
                minWidth: '100px'
              }}
            >
              {verifying ? (
                <>
                  <RefreshCw size={13} className="spin" />
                  <span>Checking...</span>
                </>
              ) : verifiedTeam ? (
                <>
                  <Check size={13} color="#3fb950" />
                  <span>Verified ✓</span>
                </>
              ) : (
                <>
                  <Search size={13} />
                  <span>Verify Team</span>
                </>
              )}
            </button>
          </div>

          {/* Validation Feedback States */}
          {!verifying && verifiedTeam && (
            <div style={{
              marginTop: '8px',
              padding: '6px 10px',
              background: 'rgba(63, 185, 80, 0.1)',
              border: '1px solid rgba(63, 185, 80, 0.25)',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#3fb950',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>✓ Team found: <b>{verifiedTeam.name}</b> ({verifiedTeam.members?.length || 0} registered)</span>
            </div>
          )}

          {!verifying && feedback?.type === 'error' && (
            <div style={{
              marginTop: '8px',
              padding: '8px 12px',
              background: 'rgba(248, 81, 73, 0.1)',
              border: '1px solid rgba(248, 81, 73, 0.25)',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#ff7b72',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{feedback.message}</span>
            </div>
          )}
        </div>

        {/* Step 2: Dynamic Member Selection */}
        <div style={{
          marginBottom: '16px',
          opacity: verifiedTeam ? 1 : 0.45,
          pointerEvents: verifiedTeam ? 'auto' : 'none',
          transition: 'opacity 0.2s ease'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '6px'
          }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#475569'
            }}>
              Select Identity
            </span>
            {verifiedTeam && (
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                {verifiedTeam.members?.length} registered
              </span>
            )}
          </div>

          {!verifiedTeam ? (
            <div style={{
              padding: '16px',
              borderRadius: '8px',
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              textAlign: 'center',
              color: '#64748b',
              fontSize: '12px'
            }}>
              Enter and verify your registered Team Name above to load members.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {verifiedTeam.members.map((member) => {
                const isSelected = selectedMember?.memberId === member.memberId;
                return (
                  <div
                    key={member.memberId}
                    onClick={() => handleSelectMember(member)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isSelected ? '#f5f3ff' : '#ffffff',
                      border: `1px solid ${isSelected ? '#7c3aed' : '#e2e8f0'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '14px',
                        height: '14px',
                        borderRadius: '50%',
                        border: isSelected ? '4px solid #7c3aed' : '2px solid #cbd5e1',
                        background: '#ffffff',
                        flexShrink: 0
                      }} />

                      <div>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected ? '#7c3aed' : '#0f172a',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {member.name}
                          {member.isCaptain && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: '#b45309',
                              background: '#fef3c7',
                              padding: '1px 6px',
                              borderRadius: '4px'
                            }}>
                              <Crown size={10} /> Leader
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: isSelected ? '#7c3aed' : '#64748b',
                      background: isSelected ? '#ede9fe' : '#f1f5f9',
                      padding: '2px 8px',
                      borderRadius: '4px'
                    }}>
                      {member.memberId}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirmation Card */}
        {selectedMember && verifiedTeam && (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            fontSize: '12px'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Team</div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{verifiedTeam.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Member</div>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{selectedMember.name}</div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#64748b' }}>Member ID</div>
                <div style={{ fontWeight: 600, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
                  {selectedMember.memberId}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Team login code (one active session per team) */}
        {verifiedTeam && (
          <div style={{ marginBottom: '16px', opacity: selectedMember ? 1 : 0.45, pointerEvents: selectedMember ? 'auto' : 'none' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
              Team Login Code *
            </label>
            <input
              type="text"
              placeholder="6-character code from organizer"
              value={teamCode}
              onChange={(e) => setTeamCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEnterWorkspace(); } }}
              autoComplete="off"
              style={{
                width: '100%', padding: '9px 12px', fontSize: '14px', fontWeight: 700,
                letterSpacing: '3px', textAlign: 'center', fontFamily: 'var(--font-mono)',
                border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', boxSizing: 'border-box'
              }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: '#64748b', marginTop: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={forceLogin} onChange={(e) => setForceLogin(e.target.checked)} />
              Force login (take over the team's single active session on another device)
            </label>
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
              One active session per team. If a teammate is already logged in elsewhere, tick Force login or ask an admin to release the session.
            </div>
          </div>
        )}

        {/* Anti-Cheat Notice */}
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          padding: '8px 12px',
          fontSize: '11px',
          color: '#92400e',
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Lock size={13} color="#d97706" style={{ flexShrink: 0 }} />
          <span>Fullscreen examination mode is mandatory. Exits trigger integrity flags.</span>
        </div>

        {/* Main Action Button */}
        <button
          type="button"
          className="btn-primary"
          onClick={handleEnterWorkspace}
          disabled={submitting || !verifiedTeam || !selectedMember || !teamCode.trim()}
          style={{
            width: '100%',
            padding: '11px',
            fontSize: '13px',
            borderRadius: '8px'
          }}
        >
          <Maximize2 size={15} />
          {submitting ? 'Entering Workspace...' : 'Enter Shared Workspace in Fullscreen'}
        </button>
      </div>
    </div>
  );
}
