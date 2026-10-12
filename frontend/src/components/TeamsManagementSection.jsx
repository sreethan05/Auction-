import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Upload,
  Download,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Database,
  Crown,
  User,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ExternalLink,
  Shield,
  Coins
} from 'lucide-react';
import {
  importSheetTeams,
  deleteAdminTeam,
  createAdminTeam,
  updateAdminTeam,
  fetchTeamPassword,
  regenerateTeamPassword,
  clearTeamSession,
  getSupabaseStatus,
  syncSupabaseManual
} from '../services/api';

export function TeamsManagementSection({
  teams = [],
  onTeamsUpdated,
  showToast,
  onSelectTargetTeam,
  onOpenUnlockModal
}) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [csvTextInput, setCsvTextInput] = useState('');
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [usersPerTeam, setUsersPerTeam] = useState(2);
  const [teamPrefix, setTeamPrefix] = useState('TEAM');
  const [importing, setImporting] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [expandedTeamNames, setExpandedTeamNames] = useState(new Set());
  const [supabaseStatus, setSupabaseStatus] = useState({ configured: false, status: 'CHECKING' });
  const [syncingSupabase, setSyncingSupabase] = useState(false);

  // Manual create team modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newMember1, setNewMember1] = useState({ name: '', rollNo: '', email: '', college: '', phone: '' });
  const [newMember2, setNewMember2] = useState({ name: '', rollNo: '', email: '', college: '', phone: '' });
  const [newMember3, setNewMember3] = useState({ name: '', rollNo: '', email: '', college: '', phone: '' });
  const [manualTeamSize, setManualTeamSize] = useState(2);

  // Edit team modal (1-3 members) + login code viewer
  const [editingTeam, setEditingTeam] = useState(null);
  const [editMembers, setEditMembers] = useState([]);
  const [teamCodes, setTeamCodes] = useState({});

  // Check Supabase status on mount
  useEffect(() => {
    checkSupabase();
  }, []);

  const checkSupabase = async () => {
    try {
      const res = await getSupabaseStatus();
      setSupabaseStatus(res);
    } catch (e) {
      setSupabaseStatus({ configured: false, status: 'LOCAL_STORAGE_ONLY' });
    }
  };

  const handleSyncSupabase = async () => {
    setSyncingSupabase(true);
    try {
      const res = await syncSupabaseManual();
      showToast(res.message || 'Teams synchronized with Supabase!');
      await checkSupabase();
    } catch (err) {
      showToast(err.message || 'Supabase sync failed', false);
    } finally {
      setSyncingSupabase(false);
    }
  };

  // Toggle accordion expand for a team
  const toggleTeamExpanded = (teamName) => {
    setExpandedTeamNames((prev) => {
      const next = new Set(prev);
      if (next.has(teamName)) next.delete(teamName);
      else next.add(teamName);
      return next;
    });
  };

  // Expand all or collapse all
  const toggleExpandAll = () => {
    if (expandedTeamNames.size === filteredTeams.length && filteredTeams.length > 0) {
      setExpandedTeamNames(new Set());
    } else {
      setExpandedTeamNames(new Set(filteredTeams.map((t) => t.name)));
    }
  };

  // Import from Google Sheet URL or pasted CSV
  const handleImportSheet = async (customCsv = null) => {
    const csvToUse = customCsv || csvTextInput;
    if (!sheetUrl.trim() && !csvToUse.trim()) {
      showToast('Please enter a Google Sheet URL or upload/paste CSV data.', false);
      return;
    }

    setImporting(true);
    try {
      const res = await importSheetTeams({
        sheetUrl: sheetUrl.trim(),
        csvText: csvToUse.trim(),
        usersPerTeam: parseInt(usersPerTeam, 10) || 2,
        teamPrefix: teamPrefix.trim() || 'TEAM'
      });

      showToast(`🎉 ${res.message || 'Teams imported successfully!'}`);
      setSheetUrl('');
      setCsvTextInput('');
      setShowCsvModal(false);
      if (onTeamsUpdated) onTeamsUpdated();
      // Auto expand imported teams
      if (res.teams && res.teams.length > 0) {
        setExpandedTeamNames(new Set(res.teams.map((t) => t.name)));
      }
    } catch (err) {
      showToast(err.message || 'Failed to import sheet.', false);
    } finally {
      setImporting(false);
    }
  };

  // File Upload handler (.csv or .txt)
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        handleImportSheet(text);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Delete Team handler
  const handleDeleteTeam = async (teamName) => {
    if (!window.confirm(`Are you sure you want to delete Team "${teamName}" and its contestants?`)) {
      return;
    }
    try {
      await deleteAdminTeam(teamName);
      showToast(`🗑️ Team "${teamName}" deleted.`);
      if (onTeamsUpdated) onTeamsUpdated();
    } catch (err) {
      showToast(err.message || 'Failed to delete team.', false);
    }
  };

  const handleShowCode = async (teamName) => {
    try {
      const res = await fetchTeamPassword(teamName);
      setTeamCodes(prev => ({ ...prev, [teamName]: res.password }));
    } catch (err) {
      showToast(err.message || 'Failed to load team code.', false);
    }
  };

  const handleRegenCode = async (teamName) => {
    if (!window.confirm(`Regenerate the login code for "${teamName}"? The old code stops working and the active session is cleared.`)) return;
    try {
      const res = await regenerateTeamPassword(teamName);
      setTeamCodes(prev => ({ ...prev, [teamName]: res.password }));
      showToast(`🔑 New login code for ${teamName}: ${res.password}`);
      if (onTeamsUpdated) onTeamsUpdated();
    } catch (err) {
      showToast(err.message || 'Failed to regenerate code.', false);
    }
  };

  const handleClearSession = async (teamName) => {
    try {
      await clearTeamSession(teamName);
      showToast(`🔌 Active session released for ${teamName}.`);
      if (onTeamsUpdated) onTeamsUpdated();
    } catch (err) {
      showToast(err.message || 'Failed to clear session.', false);
    }
  };

  const openEditModal = (team) => {
    setEditingTeam(team);
    setEditMembers((team.members || []).map(m => ({ ...m })));
  };

  const handleSaveEdit = async () => {
    if (!editingTeam) return;
    const cleaned = editMembers.filter(m => (m.name || '').trim()).slice(0, 3);
    if (cleaned.length === 0) {
      showToast('At least one member with a name is required.', false);
      return;
    }
    try {
      await updateAdminTeam(editingTeam.name, {
        members: cleaned.map((m, i) => ({ ...m, isCaptain: i === 0 })),
        captainIdx: 0
      });
      showToast(`✅ Team "${editingTeam.name}" updated (${cleaned.length} member${cleaned.length !== 1 ? 's' : ''}).`);
      setEditingTeam(null);
      if (onTeamsUpdated) onTeamsUpdated();
    } catch (err) {
      showToast(err.message || 'Failed to update team.', false);
    }
  };

  // Create manual team
  const handleCreateManualTeam = async (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      showToast('Please provide a team name.', false);
      return;
    }
    if (!newMember1.name.trim()) {
      showToast('Member 1 (Captain) name is required.', false);
      return;
    }

    const members = [{ ...newMember1, isCaptain: true }];
    if (manualTeamSize >= 2 && newMember2.name.trim()) {
      members.push({ ...newMember2, isCaptain: false });
    }
    if (manualTeamSize >= 3 && newMember3.name.trim()) {
      members.push({ ...newMember3, isCaptain: false });
    }

    try {
      await createAdminTeam({
        name: newTeamName.trim(),
        members
      });
      showToast(`✅ Created Team "${newTeamName.trim()}" with ${members.length} members!`);
      setShowCreateModal(false);
      setNewTeamName('');
      setNewMember1({ name: '', rollNo: '', email: '', college: '', phone: '' });
      setNewMember2({ name: '', rollNo: '', email: '', college: '', phone: '' });
      setNewMember3({ name: '', rollNo: '', email: '', college: '', phone: '' });
      if (onTeamsUpdated) onTeamsUpdated();
    } catch (err) {
      showToast(err.message || 'Failed to create team.', false);
    }
  };

  // Download Sample Google Sheet CSV
  const handleDownloadSampleCsv = () => {
    const sampleCsv = `Name,Email,Roll Number,Phone,College,Team Name\nMohammed Salman,salman@example.com,21CS101,9876543210,Engineering College,Synora\nSreethan Reddy,sreethan@example.com,21CS102,9876543211,Engineering College,Synora\nRukhsaar Khan,rukhsaar@example.com,21CS103,9876543212,Tech University,VisionX\nAditi Sharma,aditi@example.com,21CS104,9876543213,Tech University,VisionX\nRahul Verma,rahul@example.com,21CS105,9876543214,National Institute,\nAnanya Iyer,ananya@example.com,21CS106,9876543215,National Institute,`;
    const blob = new Blob([sampleCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auctioneer_sample_contestants_sheet.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter teams by search
  const filteredTeams = teams.filter((t) => {
    const q = teamSearchQuery.trim().toLowerCase();
    if (!q) return true;
    if (t.name?.toLowerCase().includes(q)) return true;
    if (t.captainName?.toLowerCase().includes(q)) return true;
    const hasMemberMatch = (t.members || []).some(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.rollNo?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.memberId?.toLowerCase().includes(q)
    );
    return hasMemberMatch;
  });

  const totalMembersCount = teams.reduce((acc, t) => acc + (t.members?.length || t.size || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── TOP SECTION: GOOGLE SHEET IMPORTER & SUPABASE STATUS ── */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #bfdbfe'
                }}
              >
                <Users size={18} color="#2563eb" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                  Google Sheet & Contestant Importer
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                  Upload Google Sheet / CSV to auto-group candidates into 1, 2, or 3 users per team and sync with Supabase.
                </p>
              </div>
            </div>
          </div>

          {/* Supabase Status Chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 600,
                background: supabaseStatus.configured ? '#ecfdf5' : '#fffbeb',
                border: supabaseStatus.configured ? '1px solid #a7f3d0' : '1px solid #fde68a',
                color: supabaseStatus.configured ? '#047857' : '#b45309'
              }}
            >
              <Database size={13} />
              <span>{supabaseStatus.configured ? 'Supabase: Connected' : 'Supabase: Ready for .env Key'}</span>
            </div>

            {supabaseStatus.configured && (
              <button
                type="button"
                onClick={handleSyncSupabase}
                disabled={syncingSupabase}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={12} className={syncingSupabase ? 'animate-spin' : ''} />
                <span>{syncingSupabase ? 'Syncing...' : 'Sync Supabase'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Input Form */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) auto auto', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
              Google Sheet Share Link (Viewable by anyone with link)
            </label>
            <input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              style={{
                width: '100%',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                fontFamily: 'monospace'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
              Users Per Team
            </label>
            <select
              value={usersPerTeam}
              onChange={(e) => setUsersPerTeam(Number(e.target.value))}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 12px',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={2}>2 Users / Team (Recommended)</option>
              <option value={1}>1 User / Team (Solo)</option>
              <option value={3}>3 Users / Team (Trio)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => handleImportSheet()}
              disabled={importing || !sheetUrl.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: sheetUrl.trim() ? 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)' : '#f1f5f9',
                color: sheetUrl.trim() ? '#ffffff' : '#94a3b8',
                border: sheetUrl.trim() ? 'none' : '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: sheetUrl.trim() && !importing ? 'pointer' : 'not-allowed',
                boxShadow: sheetUrl.trim() ? '0 2px 10px rgba(124, 58, 237, 0.3)' : 'none'
              }}
            >
              {importing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>{importing ? 'Importing...' : 'Fetch & Create Teams'}</span>
            </button>

            {/* Direct CSV Upload Button */}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#334155',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Upload size={14} />
              <span>Upload CSV</span>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Paste CSV
            </button>
          </div>
        </div>

        {/* Quick Helper Notes */}
        <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            💡 Sheet columns recognized: <code>Name</code>, <code>Email</code>, <code>Roll No</code>, <code>Phone</code>, <code>College</code>, and optional <code>Team Name</code>.
          </span>
          <button
            type="button"
            onClick={handleDownloadSampleCsv}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: 'none',
              color: '#2563eb',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            <Download size={12} />
            Download Sample CSV Template
          </button>
        </div>
      </div>

      {/* ── MIDDLE CONTROLS: STATS & SEARCH & MANUAL ADD ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search team, user, or roll number..."
              value={teamSearchQuery}
              onChange={(e) => setTeamSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '8px 12px 8px 34px',
                color: '#0f172a',
                fontSize: '12px',
                outline: 'none'
              }}
            />
          </div>

          <button
            type="button"
            onClick={toggleExpandAll}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {expandedTeamNames.size === filteredTeams.length && filteredTeams.length > 0 ? 'Collapse All' : 'Expand All Users'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
            {filteredTeams.length} Teams · {totalMembersCount} Contestants
          </span>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#2563eb',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Plus size={14} />
            <span>Add Team Manually</span>
          </button>
        </div>
      </div>

      {/* ── TEAMS GRID (CLICKING ANY TEAM EXPANDS BOTH USERS!) ── */}
      {filteredTeams.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            border: '1px dashed #cbd5e1',
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            color: '#64748b'
          }}
        >
          <Users size={36} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
          <h4 style={{ margin: '0 0 6px', fontSize: '15px', color: '#0f172a' }}>No teams found</h4>
          <p style={{ margin: 0, fontSize: '13px' }}>
            Paste a Google Sheet URL above or click &ldquo;Add Team Manually&rdquo; to populate contestants.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredTeams.map((team) => {
            const isExpanded = expandedTeamNames.has(team.name);
            const members = team.members || [];
            const solvedCount = (team.solved || []).length;
            const violationsCount = (team.violations || []).length;

            return (
              <div
                key={team.name}
                style={{
                  background: '#ffffff',
                  border: isExpanded ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  boxShadow: isExpanded ? '0 4px 14px rgba(37, 99, 235, 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.03)'
                }}
              >
                {/* Team Card Header Bar - Clickable to expand */}
                <div
                  onClick={() => toggleTeamExpanded(team.name)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isExpanded ? '#f8fafc' : 'transparent',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: '#eff6ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid #bfdbfe',
                        fontWeight: 800,
                        fontSize: '14px',
                        color: '#2563eb'
                      }}
                    >
                      {team.name.slice(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                          {team.name}
                        </span>

                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: team.isLocked ? '#fef2f2' : '#ecfdf5',
                            color: team.isLocked ? '#b91c1c' : '#047857',
                            border: team.isLocked ? '1px solid #fecaca' : '1px solid #a7f3d0'
                          }}
                        >
                          {team.isLocked ? 'LOCKED' : 'ACTIVE'}
                        </span>

                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: '#64748b'
                          }}
                        >
                          👥 {members.length} {members.length === 1 ? 'User' : 'Users'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '11px', color: '#64748b' }}>
                        <span>Captain: <strong style={{ color: '#0f172a' }}>{team.captainName || members[0]?.name || 'N/A'}</strong></span>
                        <span>·</span>
                        <span>Balance: <strong style={{ color: '#b45309' }}>₹{team.balance ?? 1000}</strong></span>
                        <span>·</span>
                        <span>Score: <strong style={{ color: '#2563eb' }}>{team.score || 0} pts</strong></span>
                        <span>·</span>
                        <span>Solved: <strong style={{ color: '#047857' }}>{solvedCount}</strong></span>
                        {violationsCount > 0 && (
                          <>
                            <span>·</span>
                            <span style={{ color: '#b91c1c', fontWeight: 600 }}>⚠️ {violationsCount} flags</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>
                      {isExpanded ? 'Hide Users' : 'Press to View Users'}
                    </span>
                    {isExpanded ? <ChevronUp size={16} color="#2563eb" /> : <ChevronDown size={16} color="#64748b" />}
                  </div>
                </div>

                {/* ── EXPANDED ROSTER: THE 1, 2, OR 3 USERS IN THIS TEAM ── */}
                {isExpanded && (
                  <div style={{ padding: '20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Contestant Members Assigned to {team.name} ({members.length})
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectTargetTeam) onSelectTargetTeam(team.name);
                            showToast(`Selected ${team.name} as target team.`);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#334155',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Target Team
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openEditModal(team); }}
                          style={{ padding: '4px 10px', borderRadius: '6px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Edit (1–3 members)
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleShowCode(team.name); }}
                          title="Show the team's 6-character login code"
                          style={{ padding: '4px 10px', borderRadius: '6px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
                        >
                          {teamCodes[team.name] ? `Code: ${teamCodes[team.name]}` : 'Show login code'}
                        </button>

                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleRegenCode(team.name); }}
                          title="Issue a new login code (old one stops working)"
                          style={{ padding: '4px 10px', borderRadius: '6px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Regenerate code
                        </button>

                        {team.activeSession && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleClearSession(team.name); }}
                            title={`Release active session (${team.activeSession.memberId}) so another device can log in`}
                            style={{ padding: '4px 10px', borderRadius: '6px', background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                          >
                            Release session ({team.activeSession.memberId})
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTeam(team.name);
                          }}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#b91c1c',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={11} style={{ display: 'inline', marginRight: '4px' }} />
                          Delete Team
                        </button>
                      </div>
                    </div>

                    {/* Member Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                      {members.map((member, idx) => (
                        <div
                          key={member.memberId || idx}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: member.isCaptain ? '#fffbeb' : '#eff6ff',
                                  border: member.isCaptain ? '1px solid #fde68a' : '1px solid #bfdbfe',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {member.isCaptain ? <Crown size={14} color="#b45309" /> : <User size={14} color="#2563eb" />}
                              </div>

                              <div>
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                                  {member.name}
                                </span>
                                {member.isCaptain && (
                                  <span style={{ marginLeft: '6px', fontSize: '9px', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>
                                    (Captain)
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                color: '#2563eb',
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                padding: '2px 6px',
                                borderRadius: '4px'
                              }}
                            >
                              {member.memberId || `USER-${idx + 1}`}
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {member.rollNo && (
                              <div>
                                Roll / ID: <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{member.rollNo}</strong>
                              </div>
                            )}
                            {member.email && (
                              <div>
                                Email: <span style={{ color: '#475569' }}>{member.email}</span>
                              </div>
                            )}
                            {member.college && (
                              <div>
                                College: <span style={{ color: '#475569' }}>{member.college}</span>
                              </div>
                            )}
                            {member.phone && (
                              <div>
                                Phone: <span style={{ color: '#475569' }}>{member.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: PASTE CSV TEXT DIRECTLY ── */}
      {showCsvModal && (
        <div className="ov" style={{ zIndex: 1000, padding: '20px', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div
            className="box"
            style={{
              maxWidth: '520px',
              width: '100%',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
            }}
          >
            <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Paste CSV Contestants Data</h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
              Paste comma-separated rows. Required header: <code>Name</code>. Optional: <code>Email, Roll No, Phone, College, Team Name</code>.
            </p>

            <textarea
              rows={8}
              placeholder={`Name,Email,Roll No,College\nSalman,salman@mail.com,21CS01,MIT\nSreethan,sreethan@mail.com,21CS02,MIT\nAditi,aditi@mail.com,21CS03,Stanford\nRahul,rahul@mail.com,21CS04,Stanford`}
              value={csvTextInput}
              onChange={(e) => setCsvTextInput(e.target.value)}
              style={{
                width: '100%',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '12px',
                color: '#0f172a',
                fontFamily: 'monospace',
                fontSize: '12px',
                resize: 'vertical',
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowCsvModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleImportSheet()}
                disabled={importing || !csvTextInput.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                  cursor: 'pointer'
                }}
              >
                {importing ? 'Importing...' : 'Import & Create Teams'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CREATE INDIVIDUAL TEAM MANUALLY ── */}
      {showCreateModal && (
        <div className="ov" style={{ zIndex: 1000, padding: '20px', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <form
            onSubmit={handleCreateManualTeam}
            className="box"
            style={{
              maxWidth: '540px',
              width: '100%',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
            }}
          >
            <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>Add New Team Manually</h4>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Team Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CODEX"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                style={{
                  width: '100%',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#0f172a',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                Team Size
              </label>
              <select
                value={manualTeamSize}
                onChange={(e) => setManualTeamSize(Number(e.target.value))}
                style={{
                  width: '100%',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#0f172a',
                  fontSize: '13px',
                  outline: 'none'
                }}
              >
                <option value={1}>1 Member (Solo)</option>
                <option value={2}>2 Members (Pair - Standard)</option>
                <option value={3}>3 Members (Trio)</option>
              </select>
            </div>

            {/* Member 1 */}
            <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                👑 Member 1 (Captain) *
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                <input
                  type="text"
                  required
                  placeholder="Full Name *"
                  value={newMember1.name}
                  onChange={(e) => setNewMember1({ ...newMember1, name: e.target.value })}
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Roll Number"
                  value={newMember1.rollNo}
                  onChange={(e) => setNewMember1({ ...newMember1, rollNo: e.target.value })}
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newMember1.email}
                  onChange={(e) => setNewMember1({ ...newMember1, email: e.target.value })}
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                />
                <input
                  type="text"
                  placeholder="College"
                  value={newMember1.college}
                  onChange={(e) => setNewMember1({ ...newMember1, college: e.target.value })}
                  style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                />
              </div>
            </div>

            {/* Member 2 */}
            {manualTeamSize >= 2 && (
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  👤 Member 2
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newMember2.name}
                    onChange={(e) => setNewMember2({ ...newMember2, name: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="Roll Number"
                    value={newMember2.rollNo}
                    onChange={(e) => setNewMember2({ ...newMember2, rollNo: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newMember2.email}
                    onChange={(e) => setNewMember2({ ...newMember2, email: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="College"
                    value={newMember2.college}
                    onChange={(e) => setNewMember2({ ...newMember2, college: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                </div>
              </div>
            )}

            {/* Member 3 */}
            {manualTeamSize >= 3 && (
              <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  👤 Member 3
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newMember3.name}
                    onChange={(e) => setNewMember3({ ...newMember3, name: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="Roll Number"
                    value={newMember3.rollNo}
                    onChange={(e) => setNewMember3({ ...newMember3, rollNo: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newMember3.email}
                    onChange={(e) => setNewMember3({ ...newMember3, email: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="College"
                    value={newMember3.college}
                    onChange={(e) => setNewMember3({ ...newMember3, college: e.target.value })}
                    style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', color: '#0f172a', fontSize: '12px', outline: 'none' }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                  cursor: 'pointer'
                }}
              >
                Create Team
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: EDIT TEAM (1–3 members) ── */}
      {editingTeam && (
        <div className="ov" style={{ zIndex: 1000, padding: '20px', background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}>
          <div className="box" style={{ maxWidth: '540px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>Edit Team "{editingTeam.name}"</h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>1–3 members. First member is the captain. Blank rows are dropped on save.</p>
            {[0, 1, 2].map((i) => {
              const m = editMembers[i] || { name: '', rollNo: '', email: '', college: '', phone: '' };
              return (
                <div key={i} style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: i === 0 ? '#b45309' : '#2563eb' }}>
                    {i === 0 ? '👑 Member 1 (Captain)' : `👤 Member ${i + 1}${i >= (editingTeam.members || []).length ? ' (new)' : ''}`}
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    <input placeholder="Full Name" value={m.name || ''} onChange={(e) => { const n = [...editMembers]; n[i] = { ...(n[i] || {}), name: e.target.value }; setEditMembers(n); }} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', outline: 'none' }} />
                    <input placeholder="Roll Number" value={m.rollNo || ''} onChange={(e) => { const n = [...editMembers]; n[i] = { ...(n[i] || {}), rollNo: e.target.value }; setEditMembers(n); }} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', outline: 'none' }} />
                    <input placeholder="Email" value={m.email || ''} onChange={(e) => { const n = [...editMembers]; n[i] = { ...(n[i] || {}), email: e.target.value }; setEditMembers(n); }} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', outline: 'none' }} />
                    <input placeholder="College" value={m.college || ''} onChange={(e) => { const n = [...editMembers]; n[i] = { ...(n[i] || {}), college: e.target.value }; setEditMembers(n); }} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', outline: 'none' }} />
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={() => setEditingTeam(null)} style={{ padding: '8px 16px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={handleSaveEdit} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', color: '#ffffff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Save Team</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
