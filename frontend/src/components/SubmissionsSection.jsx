import React, { useState, useEffect, useCallback } from 'react';
import { FileText, X, Download, Search, Terminal } from 'lucide-react';
import { adminFetch, adminDownloadCsv, exportRowsToPdf } from '../services/api';

const API_BASE = '/api';

export function SubmissionsSection({ teams, showToast }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [teamFilter, setTeamFilter] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminFetch(`${API_BASE}/submissions`);
      const data = await res.json();
      if (res.ok) setSubmissions(data.submissions || []);
    } catch (err) {
      console.error('Submissions load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const filtered = submissions.filter(s => {
    if (teamFilter && (s.teamName || s.teamId || '').toLowerCase() !== teamFilter.toLowerCase()) return false;
    if (verdictFilter === 'PASSED' && !s.passed) return false;
    if (verdictFilter === 'FAILED' && s.passed) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${s.problemId || ''} ${s.problemTitle || ''} ${s.memberName || ''} ${s.lang || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const passedCount = submissions.filter(s => s.passed).length;

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px',
        padding: '14px 18px', marginBottom: '16px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ position: 'relative', flex: 2, minWidth: '180px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            placeholder="Filter by problem, member, language..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: '32px', paddingRight: '10px', paddingTop: '8px', paddingBottom: '8px', fontSize: '13px', borderRadius: '8px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', boxSizing: 'border-box', outline: 'none' }}
          />
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} style={{ flex: 1, minWidth: '140px', fontSize: '13px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#ffffff', color: '#0f172a', outline: 'none' }}>
          <option value="">All Teams</option>
          {teams.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
        </select>
        <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value)} style={{ flex: 1, minWidth: '120px', fontSize: '13px', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#ffffff', color: '#0f172a', outline: 'none' }}>
          <option value="ALL">All Verdicts</option>
          <option value="PASSED">Accepted</option>
          <option value="FAILED">Failed (−10)</option>
        </select>
        <button
          className="btn-primary"
          onClick={() => adminDownloadCsv('submissions').catch(err => showToast(err.message || 'Export failed', false))}
          style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Download size={14} /> Export CSV
        </button>
        <button
          className="btn-ghost"
          onClick={() => {
            try {
              exportRowsToPdf('Submissions Report — The Bid to Win', filtered, [
                { label: 'Time', get: (s) => s.isoTime ? new Date(s.isoTime).toLocaleString() : '' },
                { label: 'Team', get: (s) => s.teamName || s.teamId || '' },
                { label: 'Member', get: (s) => s.memberName || s.memberId || '' },
                { label: 'Problem', get: (s) => `${s.problemId || ''} ${s.problemTitle || ''}`.trim() },
                { label: 'Verdict', get: (s) => s.verdict || (s.passed ? 'ACCEPTED' : 'WRONG_ANSWER') },
                { label: 'Hidden Tests', get: (s) => s.testResults ? `${s.testResults.passed}/${s.testResults.total}` : '' },
                { label: 'Penalty', get: (s) => String(s.penalty ?? 0) },
                { label: 'Points', get: (s) => String(s.awardedPoints ?? 0) },
                { label: 'Language', get: (s) => s.lang || '' }
              ]);
            } catch (err) { showToast(err.message || 'PDF export failed', false); }
          }}
          style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Download size={14} /> Export PDF
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', fontSize: '12px', color: '#64748b', flexWrap: 'wrap' }}>
        <span><b style={{ color: '#0f172a' }}>{submissions.length}</b> total submissions</span>
        <span><b style={{ color: '#059669' }}>{passedCount}</b> accepted</span>
        <span><b style={{ color: '#dc2626' }}>{submissions.length - passedCount}</b> failed</span>
        <span style={{ color: '#94a3b8' }}>Every submission is stored permanently (code, language, timestamp, test results, penalty).</span>
      </div>

      {/* Table */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)' }}>
        <div style={{ maxHeight: '560px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700, position: 'sticky', top: 0 }}>
                <th style={{ padding: '10px 14px' }}>Time</th>
                <th style={{ padding: '10px 14px' }}>Team</th>
                <th style={{ padding: '10px 14px' }}>Member</th>
                <th style={{ padding: '10px 14px' }}>Problem</th>
                <th style={{ padding: '10px 14px' }}>Verdict</th>
                <th style={{ padding: '10px 14px' }}>Hidden Tests</th>
                <th style={{ padding: '10px 14px' }}>Penalty</th>
                <th style={{ padding: '10px 14px' }}>Lang</th>
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '9px 14px', color: '#64748b' }}>{s.isoTime ? new Date(s.isoTime).toLocaleTimeString() : '—'}</td>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: '#0f172a' }}>{s.teamName || s.teamId}</td>
                  <td style={{ padding: '9px 14px', color: '#475569' }}>{s.memberName || s.memberId}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{ color: '#2563eb', fontWeight: 700 }}>{s.problemId}</span>
                    <span style={{ color: '#94a3b8' }}> {s.problemTitle || ''}</span>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{
                      fontSize: '10.5px', fontWeight: 800, padding: '2px 9px', borderRadius: '10px',
                      color: s.passed ? '#059669' : '#dc2626',
                      background: s.passed ? '#ecfdf5' : '#fef2f2',
                      border: `1px solid ${s.passed ? '#a7f3d0' : '#fecaca'}`
                    }}>
                      {s.verdict || (s.passed ? 'ACCEPTED' : 'WRONG_ANSWER')}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', color: '#475569' }}>
                    {s.testResults ? `${s.testResults.passed}/${s.testResults.total}` : '—'}
                  </td>
                  <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.penalty ? '#dc2626' : '#94a3b8' }}>
                    {s.penalty ? `${s.penalty}` : (s.insuranceUsed ? 'waived 📜' : '0')}
                  </td>
                  <td style={{ padding: '9px 14px', color: '#7c3aed', fontWeight: 600 }}>{(s.lang || '').toUpperCase() || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <button
                      className="btn-ghost"
                      onClick={() => setViewing(s)}
                      style={{ fontSize: '11px', padding: '4px 10px', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', fontWeight: 700 }}
                    >
                      <Terminal size={11} /> Code
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    {loading ? 'Loading submissions…' : 'No submissions match the filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code viewer modal */}
      {viewing && (
        <div className="ov" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.45)', position: 'fixed', inset: 0, padding: '24px' }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="box" style={{ maxWidth: '760px', width: '100%', maxHeight: '86vh', overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} color="#7c3aed" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  {viewing.teamName} · {viewing.problemId} {viewing.problemTitle || ''}
                </h3>
              </div>
              <button className="btn-ghost" onClick={() => setViewing(null)} style={{ padding: '6px' }}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              <span>Member: <b style={{ color: '#0f172a' }}>{viewing.memberName || viewing.memberId}</b></span>
              <span>Language: <b style={{ color: '#7c3aed' }}>{(viewing.lang || '—').toUpperCase()}</b></span>
              <span>Submitted: <b style={{ color: '#0f172a' }}>{viewing.isoTime ? new Date(viewing.isoTime).toLocaleString() : '—'}</b></span>
              <span>Verdict: <b style={{ color: viewing.passed ? '#059669' : '#dc2626' }}>{viewing.verdict}</b></span>
              {viewing.testResults && <span>Hidden tests: <b>{viewing.testResults.passed}/{viewing.testResults.total}</b></span>}
              <span>Penalty: <b style={{ color: viewing.penalty ? '#dc2626' : '#059669' }}>{viewing.penalty || 0}</b></span>
            </div>

            {viewing.details && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#475569', marginBottom: '12px', whiteSpace: 'pre-wrap' }}>
                {viewing.details}
              </div>
            )}

            <div style={{ background: '#0f172a', borderRadius: '10px', padding: '14px 16px', overflowX: 'auto' }}>
              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, letterSpacing: '1px', marginBottom: '8px' }}>STORED SUBMISSION SOURCE CODE</div>
              <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.55 }}>
                {viewing.code || '(code not stored for this submission — recorded before code storage was enabled)'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
