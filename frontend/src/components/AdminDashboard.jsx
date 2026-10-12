import React, { useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Lock,
  Unlock,
  Lightbulb,
  Zap,
  LogOut,
  RefreshCw,
  Search,
  CheckCircle2,
  Coins,
  Users,
  Check,
  X,
  ExternalLink,
  Eye,
  Snowflake,
  AlertTriangle,
  History,
  Clock,
  FileText,
  KeyRound,
  Copy
} from 'lucide-react';
import {
  fetchAdminOverview,
  adminUnlockProblem,
  adminLockProblem,
  adminUnlockCard,
  adminLockCard,
  adminGrantCardPass,
  adminRevealProblemHint,
  adminClearFreeze,
  adminLogout,
  adminGeneratePins,
  adminRegeneratePin,
  adminReleasePin,
  adminSetProblemPoints,
  batchSetProblemPrices,
  adminCreateProblem,
  adminUpdateProblem,
  adminDeleteProblem
} from '../services/api';
import { TeamsManagementSection } from './TeamsManagementSection';
import { WildCardsSection } from './WildCardsSection';
import { SubmissionsSection } from './SubmissionsSection';
import { EventLedgerSection } from './EventLedgerSection';

export function AdminDashboard({ onLogout, onSwitchToWorkspace }) {
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' | 'leaderboard' | 'problems' | 'hints' | 'sabotage' | 'wildcards' | 'submissions' | 'event'
  const [teams, setTeams] = useState([]);
  const [problems, setProblems] = useState([]);
  const [unlockHistory, setUnlockHistory] = useState([]);
  const [pins, setPins] = useState({});
  const [loading, setLoading] = useState(false);
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [notification, setNotification] = useState(null);

  // Leaderboard filters
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardSort, setLeaderboardSort] = useState('score'); // 'score' | 'solved' | 'balance' | 'name'

  // Problems tab filters
  const [problemSearch, setProblemSearch] = useState('');
  const [problemDiffFilter, setProblemDiffFilter] = useState('ALL');

  // Bid Price Unlock Modal
  // unlockModal: { problem, team, bidPrice }
  const [unlockModal, setUnlockModal] = useState(null);
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);

  // Problem CRUD modal: null | { mode: 'create' } | { mode: 'edit', problem }
  const [problemModal, setProblemModal] = useState(null);
  const [problemForm, setProblemForm] = useState({ id: '', title: '', diff: 'Easy', cat: '', desc: '', con: '', si: '', so: '', ht: '', customHint: '', points: '', pin: '' });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminOverview();
      const loadedTeams = data.teams || [];
      setTeams(loadedTeams);
      setProblems(data.problems || []);
      setUnlockHistory(data.unlockHistory || []);
      setPins(data.pins || {});

      // If no team is selected yet, default to the first team
      setSelectedTeamName(prev => {
        if (prev && loadedTeams.some(t => t.name === prev)) return prev;
        return loadedTeams[0]?.name || 'Synora';
      });
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3500);
    return () => clearInterval(interval);
  }, [loadData]);

  const showToast = (message, isSuccess = true) => {
    setNotification({ text: message, success: isSuccess });
    setTimeout(() => {
      setNotification(prev => (prev?.text === message ? null : prev));
    }, 4500);
  };

  // Target team object
  const targetTeam = teams.find(
    t => (t.name || '').toUpperCase() === (selectedTeamName || '').toUpperCase()
  ) || teams[0] || null;

  // --- STATS COMPUTATION FOR TOP 4 COMPACT CARDS ---
  const totalTeamsCount = teams.length;
  const activeTeamsCount = teams.filter(t => !t.isLocked).length;
  const totalByteCoins = teams.reduce((acc, t) => acc + (t.balance ?? 1000), 0);

  // Problems unlocked for current selected team
  const targetTeamUnlockedCount = (targetTeam?.unlocked || []).length;

  // --- PROBLEM UNLOCK (BID MODAL TRIGGER) ---
  const handleOpenUnlockModal = (problem) => {
    if (!targetTeam) {
      showToast('Please select a target team first.', false);
      return;
    }
    setUnlockModal({
      problem,
      team: targetTeam,
      bidPrice: '100' // Suggested default
    });
  };

  const handleConfirmUnlock = async () => {
    if (!unlockModal) return;
    const { problem, team, bidPrice } = unlockModal;

    const bidNum = Number(bidPrice);
    if (!bidPrice || isNaN(bidNum) || bidNum <= 0) {
      showToast('Please enter a valid positive bid price.', false);
      return;
    }

    const currentBalance = team.balance ?? 1000;
    if (bidNum > currentBalance) {
      showToast('Insufficient ByteCoins: Bid exceeds team balance.', false);
      return;
    }

    setUnlockSubmitting(true);
    try {
      const res = await adminUnlockProblem({
        teamName: team.name,
        problemId: problem.id,
        bidPrice: bidNum
      });

      showToast(`🔓 Unlocked ${problem.id} for ${team.name}! Deducted ${bidNum} ByteCoins.`);
      setUnlockModal(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to unlock problem', false);
    } finally {
      setUnlockSubmitting(false);
    }
  };

  const handleLockProblem = async (problemId) => {
    if (!targetTeam) return;
    try {
      await adminLockProblem({ teamName: targetTeam.name, problemId });
      showToast(`🔒 Problem ${problemId} locked for ${targetTeam.name}.`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to lock problem', false);
    }
  };

  // --- CARD UNLOCK/LOCK ACTIONS ---
  const handleToggleHintCard = async (shouldUnlock) => {
    if (!targetTeam) return;
    try {
      if (shouldUnlock) {
        await adminUnlockCard({ teamName: targetTeam.name, cardType: 'HINT' });
        showToast(`💡 Hint Pass unlocked for ${targetTeam.name}!`);
      } else {
        await adminLockCard({ teamName: targetTeam.name, cardType: 'HINT' });
        showToast(`🔒 Hint Pass locked for ${targetTeam.name}.`);
      }
      loadData();
    } catch (err) {
      showToast(err.message || 'Card update failed', false);
    }
  };

  const handleGrantHintPass = async (amount = 1) => {
    if (!targetTeam) return;
    try {
      await adminGrantCardPass({ teamName: targetTeam.name, cardType: 'HINT', amount });
      showToast(`💡 Granted +${amount} Hint Pass to ${targetTeam.name}!`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to grant pass', false);
    }
  };

  const handleRevealProblemHint = async (problemId) => {
    if (!targetTeam) return;
    try {
      await adminRevealProblemHint({ teamName: targetTeam.name, problemId });
      showToast(`💡 Revealed hint for ${problemId} to ${targetTeam.name}!`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to reveal hint', false);
    }
  };

  const handleToggleSabotageCard = async (shouldUnlock) => {
    if (!targetTeam) return;
    try {
      if (shouldUnlock) {
        await adminUnlockCard({ teamName: targetTeam.name, cardType: 'SABOTAGE' });
        showToast(`⚡ Sabotage Card unlocked for ${targetTeam.name}!`);
      } else {
        await adminLockCard({ teamName: targetTeam.name, cardType: 'SABOTAGE' });
        showToast(`🔒 Sabotage Card locked for ${targetTeam.name}.`);
      }
      loadData();
    } catch (err) {
      showToast(err.message || 'Card update failed', false);
    }
  };

  const handleGrantSabotageCard = async (amount = 1) => {
    if (!targetTeam) return;
    try {
      await adminGrantCardPass({ teamName: targetTeam.name, cardType: 'SABOTAGE', amount });
      showToast(`⚡ Granted +${amount} Sabotage Card to ${targetTeam.name}!`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to grant sabotage card', false);
    }
  };

  const handleClearTeamFreeze = async (teamName) => {
    try {
      await adminClearFreeze({ teamName });
      showToast(`❄️ Sabotage freeze cleared for ${teamName}!`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to clear freeze', false);
    }
  };

  // --- BID PRICES (Problems tab) ---
  const [easyPrice, setEasyPrice] = useState('100');
  const [mediumPrice, setMediumPrice] = useState('150');
  const [hardPrice, setHardPrice] = useState('200');
  const [pricesSaving, setPricesSaving] = useState(false);

  const handleSetPrices = async () => {
    setPricesSaving(true);
    try {
      await batchSetProblemPrices({
        easyPrice: Number(easyPrice),
        mediumPrice: Number(mediumPrice),
        hardPrice: Number(hardPrice)
      });
      showToast(`💰 Bid prices set — Easy ${easyPrice} / Medium ${mediumPrice} / Hard ${hardPrice} ByteCoins. PIN unlocks deduct these.`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to set prices', false);
    } finally {
      setPricesSaving(false);
    }
  };

  // --- PIN & POINTS MANAGEMENT (Problems tab) ---
  const handleGeneratePins = async () => {
    if (!window.confirm('Generate PINs for all problems that do not have one yet?')) return;
    try {
      const res = await adminGeneratePins(false);
      showToast(`🔑 Generated ${res.generated} PINs.`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to generate PINs', false);
    }
  };

  const handleRegeneratePin = async (problemId) => {
    if (!window.confirm(`Regenerate the PIN for ${problemId}? The old PIN stops working.`)) return;
    try {
      await adminRegeneratePin(problemId);
      showToast(`🔑 New PIN generated for ${problemId}.`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to regenerate PIN', false);
    }
  };

  const handleReleasePin = async (problemId) => {
    if (!targetTeam) {
      showToast('Select a target team first.', false);
      return;
    }
    try {
      await adminReleasePin(problemId, targetTeam.name);
      showToast(`🔑 PIN for ${problemId} released to ${targetTeam.name}. They enter it on the problem to unlock (bid price is deducted).`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to release PIN', false);
    }
  };

  const handleSetPoints = async (problemId, value) => {
    const raw = String(value).trim();
    if (raw === '') return;
    const p = Number(raw);
    if (isNaN(p) || p < 0) {
      showToast('Points must be a non-negative number.', false);
      return;
    }
    try {
      const res = await adminSetProblemPoints({ problemId, points: p });
      showToast(`🏆 ${problemId} now awards ${res.points} pts.`);
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to set points', false);
    }
  };

  // --- PROBLEM CRUD (A.4: title, description, constraints, difficulty,
  // custom points, sample I/O, extra/hidden tests, hint text) ---
  const openCreateProblem = () => {
    setProblemForm({ id: '', title: '', diff: 'Easy', cat: 'Algorithms', desc: '', con: '', si: '', so: '', ht: '', customHint: '', points: '', pin: '' });
    setProblemModal({ mode: 'create' });
  };

  const openEditProblem = (prob) => {
    setProblemForm({
      id: prob.id,
      title: prob.title || '',
      diff: prob.diff || 'Easy',
      cat: prob.cat || '',
      desc: prob.desc || '',
      con: prob.con || '',
      si: prob.si || '',
      so: prob.so || prob.eo || '',
      ht: prob.ht || '',
      customHint: prob.customHint || prob.hint || '',
      points: String(prob.pts ?? ''),
      pin: ''
    });
    setProblemModal({ mode: 'edit', problem: prob });
  };

  const handleSaveProblem = async () => {
    if (!problemForm.id.trim() || !problemForm.title.trim()) {
      showToast('Problem ID and title are required.', false);
      return;
    }
    try {
      if (problemModal?.mode === 'create') {
        await adminCreateProblem({
          id: problemForm.id.trim().toUpperCase(),
          title: problemForm.title.trim(),
          diff: problemForm.diff,
          cat: problemForm.cat,
          desc: problemForm.desc,
          con: problemForm.con,
          si: problemForm.si,
          so: problemForm.so,
          ht: problemForm.ht,
          customHint: problemForm.customHint,
          points: problemForm.points === '' ? undefined : Number(problemForm.points),
          pin: problemForm.pin.trim() || undefined
        });
        showToast(`✅ Problem ${problemForm.id.trim().toUpperCase()} created.`);
      } else {
        await adminUpdateProblem(problemForm.id, {
          title: problemForm.title.trim(),
          diff: problemForm.diff,
          cat: problemForm.cat,
          desc: problemForm.desc,
          con: problemForm.con,
          si: problemForm.si,
          so: problemForm.so,
          ht: problemForm.ht,
          customHint: problemForm.customHint,
          points: problemForm.points === '' ? undefined : Number(problemForm.points)
        });
        showToast(`✅ Problem ${problemForm.id} updated.`);
      }
      setProblemModal(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to save problem.', false);
    }
  };

  const handleDeleteProblem = async (prob) => {
    if (!window.confirm(`Delete problem ${prob.id} — ${prob.title}?\nUnlocks are removed; submissions are kept permanently for audit.`)) return;
    try {
      await adminDeleteProblem(prob.id);
      showToast(`🗑️ Problem ${prob.id} deleted.`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Failed to delete problem.', false);
    }
  };

  // Filter & sort leaderboard
  const filteredLeaderboard = [...teams]
    .filter(t => (t.name || '').toLowerCase().includes(leaderboardSearch.toLowerCase()))
    .sort((a, b) => {
      const getTeamTotal = (t) => (t.score || 0) + Math.round((t.balance ?? 1000) / 10);
      if (leaderboardSort === 'score') return getTeamTotal(b) - getTeamTotal(a);
      if (leaderboardSort === 'solved') return ((b.solved || []).length) - ((a.solved || []).length);
      if (leaderboardSort === 'balance') return (b.balance ?? 1000) - (a.balance ?? 1000);
      if (leaderboardSort === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

  // Filter problems for Problems tab
  const filteredProblems = problems.filter(prob => {
    const matchesSearch =
      prob.id.toLowerCase().includes(problemSearch.toLowerCase()) ||
      prob.title.toLowerCase().includes(problemSearch.toLowerCase()) ||
      (prob.cat || '').toLowerCase().includes(problemSearch.toLowerCase());

    const isUnlocked = Boolean(targetTeam?.unlocked && targetTeam.unlocked.includes(prob.id));

    const matchesDiff =
      problemDiffFilter === 'ALL' ||
      prob.diff.toUpperCase() === problemDiffFilter ||
      (problemDiffFilter === 'UNLOCKED' && isUnlocked) ||
      (problemDiffFilter === 'LOCKED' && !isUnlocked);

    return matchesSearch && matchesDiff;
  });

  const isHintCardUnlocked = Boolean(
    (targetTeam?.unlockedCards || []).includes('HINT') || targetTeam?.hintUnlocked
  );

  const isSabotageCardUnlocked = Boolean(
    (targetTeam?.unlockedCards || []).includes('SABOTAGE') || targetTeam?.sabotageUnlocked
  );

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      color: '#0f172a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 1. TOP ADMIN BAR */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 28px',
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        zIndex: 50,
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.04)'
      }}>
        {/* Brand */}
        {/* THE AUCTIONEER Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '16px',
              boxShadow: '0 2px 10px rgba(124, 58, 237, 0.3)',
              userSelect: 'none'
            }}>
              A
            </div>
            <div>
              <div style={{
                fontSize: '15px',
                fontWeight: 800,
                letterSpacing: '0.3px',
                color: '#0f172a',
                lineHeight: 1.1
              }}>
                THE AUCTIONEER
              </div>
              <div style={{
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.8px',
                color: '#7c3aed',
                textTransform: 'uppercase',
                lineHeight: 1
              }}>
                ADMIN PORTAL
              </div>
            </div>
          </div>

          <div style={{ width: '1px', height: '18px', background: '#e2e8f0' }} />

          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: '12px',
            background: '#f5f3ff',
            border: '1px solid #ddd6fe',
            color: '#7c3aed',
            letterSpacing: '0.4px'
          }}>
            PROCTOR & EVALUATION ENGINE
          </span>
        </div>

        {/* Global Controls & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Refresh Button */}
          <button
            className="btn-ghost"
            onClick={loadData}
            title="Sync with live database"
            style={{ fontSize: '12px', padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Sync</span>
          </button>

          {/* Switch to Team Workspace */}
          {onSwitchToWorkspace && (
            <button
              className="btn-ghost"
              onClick={onSwitchToWorkspace}
              title="View student workspace"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              <ExternalLink size={13} />
              <span>Workspace View</span>
            </button>
          )}

          {/* Logout Button */}
          <button
            onClick={() => {
              adminLogout();
              if (onLogout) onLogout();
            }}
            className="btn-ghost"
            style={{
              fontSize: '12px',
              padding: '6px 14px',
              color: '#ff7b72',
              borderColor: 'rgba(248, 81, 73, 0.25)',
              background: 'rgba(248, 81, 73, 0.06)'
            }}
          >
            <LogOut size={13} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN CONTAINER */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 28px',
        maxWidth: '1240px',
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        {/* Toast Alert */}
        {notification && (
          <div style={{
            padding: '12px 18px',
            borderRadius: '8px',
            marginBottom: '20px',
            background: notification.success ? 'rgba(63, 185, 80, 0.12)' : 'rgba(248, 81, 73, 0.12)',
            border: `1px solid ${notification.success ? 'rgba(63, 185, 80, 0.35)' : 'rgba(248, 81, 73, 0.35)'}`,
            color: notification.success ? '#3fb950' : '#f85149',
            fontWeight: 500,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)'
          }}>
            <span>{notification.text}</span>
            <button
              onClick={() => setNotification(null)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* 3. TOP SUMMARY CARDS (Compact 4 Cards) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          marginBottom: '22px'
        }}>
          {/* 1. Teams */}
          <div style={compactCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={compactLabelStyle}>TEAMS</span>
              <Users size={15} color="var(--txt-dim)" />
            </div>
            <div style={compactValueStyle}>{totalTeamsCount}</div>
            <div style={compactSubtextStyle}>Registered contest teams</div>
          </div>

          {/* 2. Active Teams */}
          <div style={compactCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={compactLabelStyle}>ACTIVE TEAMS</span>
              <CheckCircle2 size={15} color="#3fb950" />
            </div>
            <div style={{ ...compactValueStyle, color: '#3fb950' }}>{activeTeamsCount}</div>
            <div style={compactSubtextStyle}>Competing without lockout</div>
          </div>

          {/* 3. ByteCoins in Circulation */}
          <div style={compactCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={compactLabelStyle}>BYTECOINS IN CIRCULATION</span>
              <Coins size={15} color="#58a6ff" />
            </div>
            <div style={{ ...compactValueStyle, color: '#58a6ff' }}>{totalByteCoins} BC</div>
            <div style={compactSubtextStyle}>Total liquidity held by teams</div>
          </div>

          {/* 4. Problems Unlocked */}
          <div style={compactCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={compactLabelStyle}>PROBLEMS UNLOCKED</span>
              <Unlock size={15} color="#bc8cff" />
            </div>
            <div style={{ ...compactValueStyle, color: '#bc8cff' }}>
              {targetTeam ? `${targetTeamUnlockedCount} / ${problems.length}` : '—'}
            </div>
            <div style={compactSubtextStyle}>
              {targetTeam ? `Unlocked for ${targetTeam.name}` : 'Select a team'}
            </div>
          </div>
        </div>

        {/* 4. NAVIGATION TABS */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '14px'
        }}>
          {/* Navigation Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {[
              { id: 'teams', label: 'Teams & Sheet', icon: Users },
              { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
              { id: 'problems', label: 'Problems', icon: Lock },
              { id: 'wildcards', label: 'Wild Cards', icon: Zap },
              { id: 'submissions', label: 'Submissions', icon: FileText },
              { id: 'event', label: 'Event & Ledger', icon: Clock },
              { id: 'hints', label: 'Hints', icon: Lightbulb },
              { id: 'sabotage', label: 'Sabotage', icon: Snowflake }
            ].map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#7c3aed' : '#64748b',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: isActive ? '2px solid #7c3aed' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={15} color={isActive ? '#7c3aed' : '#94a3b8'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Target Team Selector (for Problems, Hints, Sabotage) */}
          {['problems', 'hints', 'sabotage'].includes(activeTab) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Target Team:
              </span>
              <select
                value={selectedTeamName}
                onChange={(e) => setSelectedTeamName(e.target.value)}
                style={{
                  fontSize: '13px',
                  padding: '7px 14px',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  color: '#0f172a',
                  fontWeight: 600,
                  outline: 'none',
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                }}
              >
                {teams.map(t => (
                  <option key={t.name} value={t.name}>
                    👥 {t.name} ({t.balance ?? 1000} BC · {t.score || 0} pts)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 5. TAB PANELS */}

        {/* ============================================================ */}
        {/* TAB 0: TEAMS & GOOGLE SHEET ROSTER                          */}
        {/* ============================================================ */}
        {activeTab === 'teams' && (
          <TeamsManagementSection
            teams={teams}
            onTeamsUpdated={loadData}
            showToast={showToast}
            onSelectTargetTeam={(name) => {
              setSelectedTeamName(name);
              setActiveTab('problems');
            }}
            onOpenUnlockModal={handleOpenUnlockModal}
          />
        )}

        {/* ============================================================ */}
        {/* TAB 1: LEADERBOARD MONITORING                                */}
        {/* ============================================================ */}
        {activeTab === 'leaderboard' && (
          <div>
            {/* Filter & Search Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  placeholder="Search team name..."
                  value={leaderboardSearch}
                  onChange={(e) => setLeaderboardSearch(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '36px',
                    paddingRight: '12px',
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    outline: 'none',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                />
              </div>

              {/* Sort selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Sort by:</span>
                <select
                  value={leaderboardSort}
                  onChange={(e) => setLeaderboardSort(e.target.value)}
                  style={{
                    fontSize: '12px',
                    padding: '8px 12px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    color: '#0f172a',
                    fontWeight: 600,
                    outline: 'none',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                >
                  <option value="score">Points (Highest First)</option>
                  <option value="solved">Problems Solved</option>
                  <option value="balance">ByteCoin Balance</option>
                  <option value="name">Team Name</option>
                </select>
              </div>
            </div>

            {/* Leaderboard Monitoring Table */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{
                    borderBottom: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#64748b',
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    fontWeight: 700
                  }}>
                    <th style={{ padding: '12px 16px', width: '60px' }}>Rank</th>
                    <th style={{ padding: '12px 16px' }}>Team Name</th>
                    <th style={{ padding: '12px 16px' }}>Score</th>
                    <th style={{ padding: '12px 16px' }}>Problems Solved</th>
                    <th style={{ padding: '12px 16px' }}>ByteCoins</th>
                    <th style={{ padding: '12px 16px' }}>Hints Used</th>
                    <th style={{ padding: '12px 16px' }}>Sabotages</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeaderboard.map((team, idx) => {
                    const rank = idx + 1;
                    const solvedCount = (team.solved || []).length;
                    const hintsRevealedCount = Object.keys(team.revealedHints || {}).length;
                    const isFrozen = Boolean(team.frozenUntil && team.frozenUntil > Date.now());

                    return (
                      <tr
                        key={team.name}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Rank */}
                        <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                          {rank === 1 ? (
                            <span style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              🥇 1
                            </span>
                          ) : rank === 2 ? (
                            <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              🥈 2
                            </span>
                          ) : rank === 3 ? (
                            <span style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              🥉 3
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>#{rank}</span>
                          )}
                        </td>

                        {/* Team Name */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{team.name}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {(team.members || []).length || team.size || 1} Member{((team.members || []).length || team.size || 1) !== 1 ? 's' : ''}
                            {team.captainName ? ` · Lead: ${team.captainName}` : ''}
                          </div>
                        </td>

                        {/* Score */}
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#7c3aed', fontSize: '14px' }}>
                          {(team.score || 0) + Math.round((team.balance ?? 1000) / 10)} pts
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>
                            Base: {team.score || 0} · Bonus: +{Math.round((team.balance ?? 1000) / 10)}
                          </div>
                        </td>

                        {/* Solved */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '10px',
                            background: solvedCount > 0 ? '#ecfdf5' : '#f8fafc',
                            border: `1px solid ${solvedCount > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                            color: solvedCount > 0 ? '#047857' : '#94a3b8',
                            fontSize: '12px',
                            fontWeight: 600
                          }}>
                            {solvedCount} Solved
                          </span>
                        </td>

                        {/* ByteCoins */}
                        <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', color: '#2563eb', fontWeight: 800, fontSize: '13px' }}>
                          {team.balance ?? 1000} BC
                        </td>

                        {/* Hints Used */}
                        <td style={{ padding: '12px 16px', color: hintsRevealedCount > 0 ? '#b45309' : '#94a3b8', fontWeight: hintsRevealedCount > 0 ? 600 : 400 }}>
                          {hintsRevealedCount} Revealed
                        </td>

                        {/* Sabotages */}
                        <td style={{ padding: '12px 16px', color: team.sabotageCardsCount > 0 ? '#e11d48' : '#94a3b8', fontWeight: team.sabotageCardsCount > 0 ? 600 : 400 }}>
                          {team.sabotageCardsCount || 0} In Inv
                        </td>

                        {/* Status */}
                        <td style={{ padding: '12px 16px' }}>
                          {team.isLocked ? (
                            <span style={{ color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                              <Lock size={12} /> Locked
                            </span>
                          ) : isFrozen ? (
                            <span style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                              <Snowflake size={12} /> Sabotaged
                            </span>
                          ) : (
                            <span style={{ color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}>
                              <CheckCircle2 size={12} /> Active
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredLeaderboard.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                        No teams match query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: PROBLEM UNLOCK MANAGEMENT                             */}
        {/* ============================================================ */}
        {activeTab === 'problems' && (
          <div>
            {/* Bid prices bar (PIN unlocks deduct these) */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px',
              padding: '14px 20px', marginBottom: '12px'
            }}>
              <div style={{ fontSize: '12.5px', color: '#1e3a8a', lineHeight: 1.5, flex: 1, minWidth: '220px' }}>
                <b>Bid prices:</b> the coins deducted when a problem is unlocked (PIN entry or direct unlock). Set once per difficulty.
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {[['Easy', easyPrice, setEasyPrice], ['Medium', mediumPrice, setMediumPrice], ['Hard', hardPrice, setHardPrice]].map(([label, val, set]) => (
                  <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#1e3a8a' }}>
                    {label}
                    <input
                      type="number" min="0" value={val}
                      onChange={(e) => set(e.target.value)}
                      style={{ width: '70px', fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #93c5fd', color: '#0f172a', fontFamily: 'var(--font-mono)' }}
                    />
                  </span>
                ))}
                <button className="btn-primary" onClick={handleSetPrices} disabled={pricesSaving} style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '8px' }}>
                  {pricesSaving ? 'Saving...' : 'Apply Prices'}
                </button>
              </div>
            </div>

            {/* PIN quick actions */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
              background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '12px',
              padding: '14px 20px', marginBottom: '18px'
            }}>
              <div style={{ fontSize: '12.5px', color: '#4c1d95', lineHeight: 1.5 }}>
                <b>Unlock PINs:</b> one PIN per problem. Copy the PIN and hand it to the winning team —
                they enter it on the locked problem to unlock it (bid price is deducted automatically).
                Wrong entries are rate-limited per team.
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button className="btn-ghost" onClick={openCreateProblem} style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '8px', fontWeight: 700, color: '#059669', background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  + New Problem
                </button>
                <button className="btn-primary" onClick={handleGeneratePins} style={{ fontSize: '12px', padding: '8px 16px', borderRadius: '8px', flexShrink: 0 }}>
                  <KeyRound size={13} /> Generate Missing PINs
                </button>
              </div>
            </div>

            {/* Target Team Banner */}
            {targetTeam && (
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
              }}>
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.8px', color: '#2563eb', fontWeight: 700 }}>
                    Selected Target Team
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {targetTeam.name}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Available Balance</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#2563eb', fontFamily: 'var(--font-mono)' }}>
                      {targetTeam.balance ?? 1000} ByteCoins
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Score</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>
                      {targetTeam.score || 0} pts
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>Unlocked</div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                      {targetTeamUnlockedCount} / {problems.length}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filter controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '260px' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  placeholder="Filter problems by ID, title..."
                  value={problemSearch}
                  onChange={(e) => setProblemSearch(e.target.value)}
                  style={{
                    width: '100%',
                    paddingLeft: '36px',
                    paddingRight: '12px',
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    fontSize: '13px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    outline: 'none',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                />
              </div>

              {/* Segmented Filter */}
              <div style={{
                display: 'flex',
                background: '#f1f5f9',
                padding: '3px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                gap: '2px'
              }}>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'UNLOCKED', label: 'Unlocked' },
                  { id: 'LOCKED', label: 'Locked' }
                ].map(tab => {
                  const isActive = problemDiffFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setProblemDiffFilter(tab.id)}
                      style={{
                        background: isActive ? '#ffffff' : 'transparent',
                        color: isActive ? '#0f172a' : '#64748b',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 1px 2px rgba(0, 0, 0, 0.06)' : 'none'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Problem List (Cleaner Problem List) */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
              marginBottom: '32px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              {filteredProblems.map((prob) => {
                const isUnlocked = Boolean(targetTeam?.unlocked && targetTeam.unlocked.includes(prob.id));
                const diffColor = prob.diff === 'Hard' ? '#dc2626' : prob.diff === 'Medium' ? '#d97706' : '#059669';
                const pinRecord = pins[prob.id];
                const pinReleasedTo = pinRecord?.releasedTo || null;

                return (
                  <div
                    key={prob.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 20px',
                      borderBottom: '1px solid #f1f5f9',
                      gap: '16px',
                      transition: 'background 0.15s ease',
                      flexWrap: 'wrap'
                    }}
                  >
                    {/* Left: ID & Title & Metadata */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: isUnlocked ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${isUnlocked ? '#bfdbfe' : '#e2e8f0'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isUnlocked ? '#2563eb' : '#94a3b8',
                        flexShrink: 0
                      }}>
                        {isUnlocked ? <Unlock size={16} /> : <Lock size={15} />}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                          {prob.id} &nbsp;{prob.title}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#64748b', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span style={{ color: diffColor, fontWeight: 700 }}>{prob.diff}</span>
                          <span>•</span>
                          <span style={{ fontWeight: 600 }}>{prob.pts} pts</span>
                          {/* Custom points editor */}
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              min="0"
                              defaultValue={prob.pts}
                              key={`${prob.id}-${prob.pts}`}
                              onBlur={(e) => {
                                if (Number(e.target.value) !== prob.pts) handleSetPoints(prob.id, e.target.value);
                              }}
                              title="Custom points for this problem (Enter or click away to apply)"
                              style={{
                                width: '58px', fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                                border: '1px solid #cbd5e1', color: '#7c3aed', fontWeight: 700,
                                fontFamily: 'var(--font-mono)'
                              }}
                            />
                            <span style={{ fontSize: '10px', color: '#94a3b8' }}>set pts</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Middle: Unlock PIN block */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {pinRecord ? (
                        <>
                          <span
                            title={pinReleasedTo ? `Released to ${pinReleasedTo}` : 'PIN generated — not yet released'}
                            style={{
                              fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 800, letterSpacing: '2px',
                              color: pinReleasedTo ? '#059669' : '#0f172a',
                              background: '#f8fafc', border: `1px solid ${pinReleasedTo ? '#a7f3d0' : '#e2e8f0'}`,
                              borderRadius: '6px', padding: '5px 10px', cursor: 'pointer'
                            }}
                            onClick={() => { navigator.clipboard?.writeText(pinRecord.pin); showToast(`PIN for ${prob.id} copied: ${pinRecord.pin}`); }}
                          >
                            <KeyRound size={11} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                            {pinRecord.pin}
                          </span>
                          <button
                            className="btn-ghost"
                            onClick={() => handleRegeneratePin(prob.id)}
                            title="Regenerate this PIN"
                            style={{ fontSize: '10.5px', padding: '4px 8px' }}
                          >
                            <RefreshCw size={11} />
                          </button>
                          {targetTeam && (
                            <button
                              className="btn-ghost"
                              onClick={() => handleReleasePin(prob.id)}
                              title={`Release this PIN to ${targetTeam.name}`}
                              style={{ fontSize: '10.5px', padding: '4px 9px', color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', fontWeight: 700 }}
                            >
                              Release →
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          className="btn-ghost"
                          onClick={handleGeneratePins}
                          title="Generate PINs for all problems"
                          style={{ fontSize: '10.5px', padding: '4px 10px', fontWeight: 600 }}
                        >
                          <KeyRound size={11} /> Generate PINs
                        </button>
                      )}
                    </div>

                    {/* Right: Status Tag + Clean Action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        className="btn-ghost"
                        onClick={() => openEditProblem(prob)}
                        title="Edit title, description, constraints, tests, hint, points"
                        style={{ fontSize: '11px', padding: '6px 10px', borderRadius: '6px' }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-ghost"
                        onClick={() => handleDeleteProblem(prob)}
                        title="Delete this problem"
                        style={{ fontSize: '11px', padding: '6px 10px', borderRadius: '6px', color: '#dc2626', borderColor: '#fecaca', background: '#fff1f2' }}
                      >
                        Delete
                      </button>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: isUnlocked ? '#ecfdf5' : '#f8fafc',
                        border: `1px solid ${isUnlocked ? '#a7f3d0' : '#e2e8f0'}`,
                        color: isUnlocked ? '#047857' : '#94a3b8',
                        letterSpacing: '0.4px'
                      }}>
                        {isUnlocked ? 'UNLOCKED' : 'LOCKED'}
                      </span>

                      {isUnlocked ? (
                        <button
                          className="btn-ghost"
                          onClick={() => handleLockProblem(prob.id)}
                          style={{
                            fontSize: '12px',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            color: '#dc2626',
                            borderColor: '#fecdd3',
                            background: '#fff1f2'
                          }}
                        >
                          <Lock size={13} /> Lock Problem
                        </button>
                      ) : (
                        <button
                          className="btn-primary"
                          onClick={() => handleOpenUnlockModal(prob)}
                          style={{
                            fontSize: '12px',
                            padding: '7px 16px',
                            borderRadius: '8px'
                          }}
                        >
                          <Unlock size={13} /> Unlock Problem
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredProblems.length === 0 && (
                <div style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No problems match filter.
                </div>
              )}
            </div>

            {/* UNLOCK HISTORY SECTION */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <History size={16} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Unlock Transaction History
                </h3>
              </div>

              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      color: '#64748b',
                      fontSize: '11px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontWeight: 700
                    }}>
                      <th style={{ padding: '10px 14px' }}>Time</th>
                      <th style={{ padding: '10px 14px' }}>Team</th>
                      <th style={{ padding: '10px 14px' }}>Problem</th>
                      <th style={{ padding: '10px 14px' }}>Bid Price</th>
                      <th style={{ padding: '10px 14px' }}>Prev Balance</th>
                      <th style={{ padding: '10px 14px' }}>New Balance</th>
                      <th style={{ padding: '10px 14px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unlockHistory.map((rec) => (
                      <tr
                        key={rec.id}
                        style={{ borderBottom: '1px solid #f1f5f9' }}
                      >
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>
                          {rec.displayTime || new Date(rec.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                          {rec.teamName}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ color: '#2563eb', fontWeight: 700 }}>{rec.problemId}</span>
                          {rec.problemTitle ? ` · ${rec.problemTitle}` : ''}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: '#dc2626', fontWeight: 700 }}>
                          -{rec.bidPrice || rec.bidAmount || rec.price} BC
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: '#64748b' }}>
                          {rec.previousBalance ?? '—'} BC
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: '#16a34a', fontWeight: 700 }}>
                          {rec.remainingBalance} BC
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: '11px',
                            color: '#047857',
                            background: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            padding: '3px 8px',
                            borderRadius: '10px',
                            fontWeight: 600
                          }}>
                            {rec.status || 'UNLOCKED'}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {unlockHistory.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                          No unlock transactions recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2.5: WILD CARDS MODULE                                   */}
        {/* ============================================================ */}
        {activeTab === 'wildcards' && (
          <WildCardsSection teams={teams} problems={problems} showToast={showToast} />
        )}

        {/* ============================================================ */}
        {/* TAB 2.6: SUBMISSIONS VIEWER                                  */}
        {/* ============================================================ */}
        {activeTab === 'submissions' && (
          <SubmissionsSection teams={teams} showToast={showToast} />
        )}

        {/* ============================================================ */}
        {/* TAB 2.7: EVENT CLOCK, OVERRIDES & LEDGER                     */}
        {/* ============================================================ */}
        {activeTab === 'event' && (
          <EventLedgerSection teams={teams} showToast={showToast} />
        )}

        {/* ============================================================ */}
        {/* TAB 3: HINT CARD MANAGEMENT                                  */}
        {/* ============================================================ */}
        {activeTab === 'hints' && (
          <div>
            {/* Hint Hero Banner */}
            <div style={{
              background: '#eff6ff',
              border: `1px solid ${isHintCardUnlocked ? '#bfdbfe' : '#e2e8f0'}`,
              borderRadius: '12px',
              padding: '22px 24px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  background: isHintCardUnlocked ? '#dbeafe' : '#f1f5f9',
                  border: `1px solid ${isHintCardUnlocked ? '#93c5fd' : '#cbd5e1'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isHintCardUnlocked ? '#2563eb' : '#94a3b8'
                }}>
                  <Lightbulb size={24} />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    Hint Pass Card Authority
                  </h3>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Current State for <b>{targetTeam?.name || 'Selected Team'}</b>:{' '}
                    <span style={{ color: isHintCardUnlocked ? '#059669' : '#dc2626', fontWeight: 700 }}>
                      {isHintCardUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}
                    </span>
                    {' · Inventory: '}
                    <b style={{ color: '#0f172a' }}>{targetTeam?.hintPassesCount || 0} Available</b>
                  </div>
                </div>
              </div>

              {/* Master Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn-ghost"
                  onClick={() => handleGrantHintPass(1)}
                  title="Award 1 free hint pass to team inventory"
                  style={{ fontSize: '12px', padding: '8px 14px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 600 }}
                >
                  + Grant 1 Hint Pass
                </button>

                {isHintCardUnlocked ? (
                  <button
                    className="btn-ghost"
                    onClick={() => handleToggleHintCard(false)}
                    style={{
                      fontSize: '13px',
                      padding: '8px 16px',
                      color: '#dc2626',
                      borderColor: '#fecdd3',
                      background: '#fff1f2',
                      fontWeight: 600
                    }}
                  >
                    <Lock size={14} /> Lock Hint Card
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => handleToggleHintCard(true)}
                    style={{ fontSize: '13px', padding: '8px 18px', fontWeight: 600 }}
                  >
                    <Unlock size={14} /> Unlock Hint Card
                  </button>
                )}
              </div>
            </div>

            {/* Problem Hints Dispatch */}
            <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Problem Hints Dispatch for {targetTeam?.name}
            </h4>

            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              {problems.map((prob) => {
                const isRevealed = Boolean(targetTeam?.revealedHints?.[prob.id]);

                return (
                  <div
                    key={prob.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 20px',
                      borderBottom: '1px solid #f1f5f9',
                      gap: '14px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                        {prob.id} &nbsp;{prob.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {isRevealed ? (
                          <span style={{ color: '#059669', fontWeight: 600 }}>
                            ✓ Hint revealed to {targetTeam?.name}
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Hint concealed from team</span>
                        )}
                      </div>
                    </div>

                    <div>
                      {isRevealed ? (
                        <span style={{
                          fontSize: '12px',
                          color: '#047857',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 600
                        }}>
                          <Check size={12} /> Revealed
                        </span>
                      ) : (
                        <button
                          className="btn-ghost"
                          onClick={() => handleRevealProblemHint(prob.id)}
                          style={{ fontSize: '12px', padding: '6px 14px', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', fontWeight: 600 }}
                        >
                          <Eye size={13} /> Reveal Hint
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: SABOTAGE CARD MANAGEMENT                              */}
        {/* ============================================================ */}
        {activeTab === 'sabotage' && (
          <div>
            {/* Sabotage Hero Banner */}
            <div style={{
              background: '#fff1f2',
              border: `1px solid ${isSabotageCardUnlocked ? '#fecdd3' : '#e2e8f0'}`,
              borderRadius: '12px',
              padding: '22px 24px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  background: isSabotageCardUnlocked ? '#ffe4e6' : '#f1f5f9',
                  border: `1px solid ${isSabotageCardUnlocked ? '#fca5a5' : '#cbd5e1'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isSabotageCardUnlocked ? '#e11d48' : '#94a3b8'
                }}>
                  <Zap size={24} />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                    Sabotage Card Authority
                  </h3>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    Current State for <b>{targetTeam?.name || 'Selected Team'}</b>:{' '}
                    <span style={{ color: isSabotageCardUnlocked ? '#059669' : '#dc2626', fontWeight: 700 }}>
                      {isSabotageCardUnlocked ? '🔓 UNLOCKED' : '🔒 LOCKED'}
                    </span>
                    {' · Inventory: '}
                    <b style={{ color: '#0f172a' }}>{targetTeam?.sabotageCardsCount || 0} Available</b>
                  </div>
                </div>
              </div>

              {/* Master Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  className="btn-ghost"
                  onClick={() => handleGrantSabotageCard(1)}
                  title="Award 1 free sabotage card to team inventory"
                  style={{ fontSize: '12px', padding: '8px 14px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#0f172a', fontWeight: 600 }}
                >
                  + Grant 1 Sabotage Card
                </button>

                {isSabotageCardUnlocked ? (
                  <button
                    className="btn-ghost"
                    onClick={() => handleToggleSabotageCard(false)}
                    style={{
                      fontSize: '13px',
                      padding: '8px 16px',
                      color: '#dc2626',
                      borderColor: '#fecdd3',
                      background: '#fff1f2',
                      fontWeight: 600
                    }}
                  >
                    <Lock size={14} /> Lock Sabotage Card
                  </button>
                ) : (
                  <button
                    className="btn-primary"
                    onClick={() => handleToggleSabotageCard(true)}
                    style={{ fontSize: '13px', padding: '8px 18px', fontWeight: 600, background: 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)' }}
                  >
                    <Unlock size={14} /> Unlock Sabotage Card
                  </button>
                )}
              </div>
            </div>

            {/* Active Freeze Monitoring & Admin Override */}
            <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Active Sabotage Freezes
            </h4>

            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
            }}>
              {teams.map((t) => {
                const isFrozen = Boolean(t.frozenUntil && t.frozenUntil > Date.now());
                const remainingSecs = isFrozen ? Math.max(0, Math.ceil((t.frozenUntil - Date.now()) / 1000)) : 0;
                const remainingMins = Math.ceil(remainingSecs / 60);

                return (
                  <div
                    key={t.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 20px',
                      borderBottom: '1px solid #f1f5f9',
                      gap: '14px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '34px',
                        height: '34px',
                        borderRadius: '8px',
                        background: isFrozen ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${isFrozen ? '#bfdbfe' : '#e2e8f0'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isFrozen ? '#2563eb' : '#94a3b8'
                      }}>
                        {isFrozen ? <Snowflake size={16} /> : <Zap size={15} />}
                      </div>

                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                          {t.name}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                          {isFrozen ? (
                            <span style={{ color: '#0284c7', fontWeight: 600 }}>
                              ❄️ Frozen by {t.frozenBy || 'Rival Team'} ({remainingMins}m / {remainingSecs}s remaining)
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>Workspace operating normally</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isFrozen ? (
                        <button
                          className="btn-ghost"
                          onClick={() => handleClearTeamFreeze(t.name)}
                          style={{
                            fontSize: '12px',
                            padding: '6px 14px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#2563eb',
                            fontWeight: 700
                          }}
                        >
                          <Snowflake size={13} /> Clear Freeze
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                          No freeze active
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* BID PRICE UNLOCK MODAL                                       */}
      {/* ============================================================ */}
      {unlockModal && (
        <div
          className="ov"
          style={{
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(4px)',
            position: 'fixed',
            inset: 0,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !unlockSubmitting) {
              setUnlockModal(null);
            }
          }}
        >
          <div
            className="box"
            style={{
              maxWidth: '440px',
              width: '100%',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '26px 28px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563eb'
                }}>
                  <Unlock size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                  Unlock Problem
                </h3>
              </div>
              <button
                onClick={() => !unlockSubmitting && setUnlockModal(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Context Info */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              fontSize: '13px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Problem:</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>
                  {unlockModal.problem.id} {unlockModal.problem.title}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Team:</span>
                <span style={{ fontWeight: 700, color: '#2563eb' }}>
                  {unlockModal.team.name}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>Team ByteCoins:</span>
                <span style={{ fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                  {unlockModal.team.balance ?? 1000} ByteCoins
                </span>
              </div>
            </div>

            {/* Bid Input */}
            {(() => {
              const currentBalance = unlockModal.team.balance ?? 1000;
              const rawBid = unlockModal.bidPrice;
              const bidNum = Number(rawBid);
              const isNumeric = rawBid !== '' && !isNaN(bidNum);
              const isPositive = isNumeric && bidNum > 0;
              const isOverBalance = isNumeric && bidNum > currentBalance;
              const remainingBalance = isNumeric ? currentBalance - bidNum : currentBalance;
              const isValid = isPositive && !isOverBalance;

              return (
                <div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                      Enter Bid Price
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="1"
                        max={currentBalance}
                        placeholder="e.g. 100"
                        value={unlockModal.bidPrice}
                        onChange={(e) => setUnlockModal({ ...unlockModal, bidPrice: e.target.value })}
                        autoFocus
                        style={{
                          width: '100%',
                          padding: '10px 90px 10px 14px',
                          fontSize: '15px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          borderRadius: '8px',
                          background: '#f8fafc',
                          border: `1px solid ${isOverBalance ? '#dc2626' : '#cbd5e1'}`,
                          color: '#0f172a',
                          boxSizing: 'border-box',
                          outline: 'none'
                        }}
                      />
                      <span style={{
                        position: 'absolute',
                        right: '14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#2563eb'
                      }}>
                        ByteCoins
                      </span>
                    </div>

                    {/* Validation Alerts */}
                    {isOverBalance && (
                      <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <AlertTriangle size={14} />
                        <span>Insufficient ByteCoins</span>
                      </div>
                    )}

                    {rawBid !== '' && !isPositive && (
                      <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#dc2626'
                      }}>
                        Bid price must be greater than 0.
                      </div>
                    )}
                  </div>

                  {/* Remaining Balance Display */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    marginBottom: '22px',
                    fontSize: '13px'
                  }}>
                    <span style={{ color: '#64748b' }}>Remaining Balance:</span>
                    <span style={{
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)',
                      color: isOverBalance ? '#dc2626' : '#16a34a',
                      fontSize: '14px'
                    }}>
                      {isOverBalance ? '0' : remainingBalance} ByteCoins
                    </span>
                  </div>

                  {/* Modal Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setUnlockModal(null)}
                      disabled={unlockSubmitting}
                      style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', fontWeight: 600 }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleConfirmUnlock}
                      disabled={!isValid || unlockSubmitting}
                      style={{
                        padding: '9px 20px',
                        fontSize: '13px',
                        borderRadius: '8px',
                        opacity: isValid && !unlockSubmitting ? 1 : 0.45,
                        cursor: isValid && !unlockSubmitting ? 'pointer' : 'not-allowed',
                        background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
                        boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)'
                      }}
                    >
                      {unlockSubmitting ? 'Unlocking...' : 'Unlock Problem'}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* PROBLEM CREATE / EDIT MODAL */}
      {problemModal && (
        <div className="ov" style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.4)', position: 'fixed', inset: 0, padding: '20px' }} onClick={(e) => { if (e.target === e.currentTarget) setProblemModal(null); }}>
          <div className="box" style={{ maxWidth: '640px', width: '100%', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                {problemModal.mode === 'create' ? '+ New Problem' : `Edit ${problemForm.id}`}
              </h3>
              <button onClick={() => setProblemModal(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>ID *</label>
                <input value={problemForm.id} disabled={problemModal.mode === 'edit'} onChange={(e) => setProblemForm({ ...problemForm, id: e.target.value.toUpperCase() })} placeholder="E94" style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>TITLE *</label>
                <input value={problemForm.title} onChange={(e) => setProblemForm({ ...problemForm, title: e.target.value })} placeholder="Problem title" style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>DIFFICULTY</label>
                <select value={problemForm.diff} onChange={(e) => setProblemForm({ ...problemForm, diff: e.target.value })} style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none' }}>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>CATEGORY</label>
                <input value={problemForm.cat} onChange={(e) => setProblemForm({ ...problemForm, cat: e.target.value })} placeholder="Arrays / DP / Graphs..." style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>POINTS (custom)</label>
                <input type="number" min="0" value={problemForm.points} onChange={(e) => setProblemForm({ ...problemForm, points: e.target.value })} placeholder="e.g. 150" style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              {problemModal.mode === 'create' && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>PIN (optional)</label>
                  <input value={problemForm.pin} onChange={(e) => setProblemForm({ ...problemForm, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="6-digit" style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-mono)' }} />
                </div>
              )}
            </div>
            {[
              ['desc', 'DESCRIPTION', 4, 'Full problem statement...'],
              ['con', 'CONSTRAINTS', 2, '1 <= N <= 10^5 ...'],
              ['si', 'SAMPLE INPUT', 2, 'stdin for the sample'],
              ['so', 'SAMPLE / EXPECTED OUTPUT', 2, 'stdout for the sample'],
              ['ht', 'HIDDEN TESTS (input --- expected, blocks split by ===)', 3, 'input1\n---\nexpected1\n===\ninput2\n---\nexpected2'],
              ['customHint', 'HINT TEXT (released to the buyer team only)', 2, 'Think about...']
            ].map(([key, label, rows, ph]) => (
              <div key={key} style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>{label}</label>
                <textarea rows={rows} value={problemForm[key]} onChange={(e) => setProblemForm({ ...problemForm, [key]: e.target.value })} placeholder={ph} style={{ width: '100%', padding: '8px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', boxSizing: 'border-box', fontFamily: (key === 'si' || key === 'so' || key === 'ht') ? 'var(--font-mono)' : 'inherit', resize: 'vertical' }} />
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" className="btn-ghost" onClick={() => setProblemModal(null)} style={{ padding: '9px 18px', fontSize: '13px', borderRadius: '8px' }}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleSaveProblem} style={{ padding: '9px 20px', fontSize: '13px', borderRadius: '8px' }}>
                {problemModal.mode === 'create' ? 'Create Problem' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact card styling
const compactCardStyle = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '16px 18px',
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
};

const compactLabelStyle = {
  fontSize: '11px',
  color: '#64748b',
  fontWeight: 700,
  letterSpacing: '0.5px'
};

const compactValueStyle = {
  fontSize: '22px',
  fontWeight: 800,
  fontFamily: 'var(--font-mono)',
  color: '#0f172a',
  lineHeight: 1.2,
  marginBottom: '3px'
};

const compactSubtextStyle = {
  fontSize: '12px',
  color: '#94a3b8',
  lineHeight: 1.3
};
