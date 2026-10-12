import React, { useState } from 'react';
import { Shield, Lock, User, ArrowRight, AlertCircle, ArrowLeft } from 'lucide-react';
import { adminLogin } from '../services/api';

export function AdminLogin({ onLoginSuccess, onBackToWorkspace }) {
  const [adminId, setAdminId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!adminId.trim() || !password.trim()) {
      setError('Please provide both Admin ID and Password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await adminLogin(adminId.trim(), password);
      if (res.success) {
        onLoginSuccess();
      } else {
        setError('Authentication failed. Please verify credentials.');
      }
    } catch (err) {
      setError(err.message || 'Invalid Admin ID or Password. Access denied.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '24px',
      background: 'radial-gradient(1000px 500px at 50% 10%, rgba(124, 58, 237, 0.08), transparent 70%), #f8fafc',
      color: '#0f172a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Container Card */}
      <div style={{
        width: '100%',
        maxWidth: '440px',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '36px 32px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Top Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.3)',
            marginBottom: '16px',
            userSelect: 'none',
            color: '#ffffff',
            fontWeight: 800,
            fontSize: '28px'
          }}>
            A
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '6px'
          }}>
            <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '0.4px', color: '#0f172a' }}>
              THE AUCTIONEER
            </span>
            <span style={{ color: '#7c3aed', fontWeight: 600 }}>•</span>
            <span style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              color: '#7c3aed',
              textTransform: 'uppercase'
            }}>
              ADMIN PORTAL
            </span>
          </div>

          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#64748b',
            lineHeight: 1.5
          }}>
            Online DSA Examination & Proctor Console
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '13px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Admin ID field */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--txt-muted)',
              marginBottom: '6px'
            }}>
              Admin ID
            </label>
            <div style={{ position: 'relative' }}>
              <User
                size={16}
                color="#64748b"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="text"
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                placeholder="Enter Admin ID"
                autoFocus
                style={{
                  width: '100%',
                  paddingLeft: '38px',
                  paddingRight: '12px',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Password field */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--txt-muted)',
              marginBottom: '6px'
            }}>
              Master Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock
                size={16}
                color="#64748b"
                style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Admin Password"
                style={{
                  width: '100%',
                  paddingLeft: '38px',
                  paddingRight: '12px',
                  paddingTop: '10px',
                  paddingBottom: '10px',
                  fontSize: '14px',
                  borderRadius: '8px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '12px 18px',
              fontSize: '14px',
              fontWeight: 600,
              borderRadius: '8px',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.25)'
            }}
          >
            {loading ? (
              'Authenticating...'
            ) : (
              <>
                <span>Access Admin Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Back to Workspace button */}
        {onBackToWorkspace && (
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              type="button"
              onClick={onBackToWorkspace}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--txt-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px'
              }}
            >
              <ArrowLeft size={13} /> Go to Participant Site
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
