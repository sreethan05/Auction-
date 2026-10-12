import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { ProblemCatalog } from './components/ProblemCatalog';
import { CodeEditorPane } from './components/CodeEditorPane';
import { GateModal } from './components/GateModal';
import { LockOverlay } from './components/LockOverlay';
import { LeaderboardModal } from './components/LeaderboardModal';
import { TransactionsModal } from './components/TransactionsModal';
import { SabotageFreezeOverlay } from './components/SabotageFreezeOverlay';
import { EffectBanner } from './components/EffectBanner';
import { BlackoutOverlay } from './components/BlackoutOverlay';
import { AdminLogin } from './components/AdminLogin';
import { AdminDashboard } from './components/AdminDashboard';
import { useAntiCheat } from './hooks/useAntiCheat';
import {
  fetchProblems,
  getTeamStatus,
  fetchEventSettings,
  notifyMemberWorking,
  runCodeAsync,
  submitCodeAsync,
  isAdminAuthenticated,
  adminLogout
} from './services/api';
import { CheckCircle2, AlertTriangle, Unlock, Lock, Users, Sparkles } from 'lucide-react';

const DEFAULT_TEMPLATES = {
  python: `import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: parse input, solve, print output\n    print()\n\nif __name__ == "__main__":\n    main()\n`,
  c: `#include <stdio.h>\n\nint main() {\n    // TODO: read input with scanf, solve, print with printf\n    return 0;\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(null);\n    // TODO: read input with cin, solve, print with cout\n    return 0;\n}\n`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: read input, solve, print output\n    }\n}\n`
};

export function App() {
  const [team, setTeam] = useState(null);
  const [currentMember, setCurrentMember] = useState(null);
  const [isExamStarted, setIsExamStarted] = useState(false);
  const [problems, setProblems] = useState([]);
  const [problemPrices, setProblemPrices] = useState({});
  const [currentProblemId, setCurrentProblemId] = useState(null);
  const [lang, setLang] = useState('python');
  const [codeMap, setCodeMap] = useState({});
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [eventSettings, setEventSettings] = useState(null);

  const [viewMode, setViewMode] = useState(() =>
    window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'admin' : 'workspace'
  );
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => isAdminAuthenticated());

  const socketRef = useRef(null);

  // 1. Initial problem & pricing fetch
  const loadProblemsAndPrices = useCallback(async () => {
    try {
      const data = await fetchProblems();
      setProblems(data.problems || []);
      setProblemPrices(data.prices || {});
    } catch (err) {
      console.error('Error fetching problems:', err);
    }
  }, []);

  useEffect(() => {
    loadProblemsAndPrices();
  }, [loadProblemsAndPrices]);

  // 1b. Event clock (countdown, wild card cutoff, leaderboard freeze)
  useEffect(() => {
    fetchEventSettings().then(setEventSettings).catch(() => {});
    const interval = setInterval(() => {
      fetchEventSettings().then(setEventSettings).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // 2. Real-Time WebSocket Connection
  useEffect(() => {
    if (!team?.name || !isExamStarted) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let ws;
    try {
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        // Announce team membership to receive real-time workspace broadcasts
        ws.send(JSON.stringify({
          type: 'JOIN_TEAM',
          teamName: team.name,
          memberId: currentMember?.memberId
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TEAM_WORKSPACE_UPDATED') {
            if (msg.team) {
              setTeam(msg.team);
            }
          } else if (msg.type === 'TEAM_SABOTAGED') {
            if (msg.team) {
              setTeam(msg.team);
            }
          } else if (msg.type === 'PRICE_UPDATED') {
            setProblemPrices(prev => ({
              ...prev,
              [msg.problemId]: msg.price
            }));
          } else if (msg.type === 'PRICES_UPDATED') {
            setProblemPrices(msg.prices || {});
          } else if (msg.type === 'EVENT_UPDATED') {
            if (msg.eventSettings) {
              setEventSettings(msg.eventSettings);
            }
          } else if (msg.type === 'TEAM_LOCKED') {
            if (msg.team) {
              setTeam(msg.team);
            }
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
    } catch (e) {
      console.error('WebSocket connection error:', e);
    }

    return () => {
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    };
  }, [team?.name, currentMember?.memberId, isExamStarted]);

  // 3. Periodic fallback polling of team, prices, and event clock
  useEffect(() => {
    if (!team?.name || !isExamStarted) return;
    const interval = setInterval(async () => {
      try {
        const [teamData, probData] = await Promise.all([
          getTeamStatus(team.name),
          fetchProblems()
        ]);
        if (teamData.team) {
          setTeam(teamData.team);
        }
        if (teamData.eventSettings) {
          setEventSettings(teamData.eventSettings);
        }
        if (probData.prices) {
          setProblemPrices(probData.prices);
        }
      } catch (e) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [team?.name, isExamStarted]);

  // 4. Anti-Cheat Integration with Member-Level Attribution
  const handleLockStatusChange = useCallback((locked, reason) => {
    setTeam(prev => prev ? { ...prev, isLocked: locked, lockReason: reason || prev.lockReason } : prev);
  }, []);

  const handleViolationLogged = useCallback((entry) => {
    setTeam(prev => prev ? { ...prev, violations: [entry, ...(prev.violations || [])] } : prev);
  }, []);

  const { reportViolation, enterFullscreen, internalClipboardRef } = useAntiCheat({
    teamName: team?.name,
    memberId: currentMember?.memberId,
    isStarted: isExamStarted,
    isLocked: team?.isLocked || false,
    onLockStatusChange: handleLockStatusChange,
    onViolationLogged: handleViolationLogged
  });

  // 5. Team Session Ready (from GateModal registration or login)
  const handleTeamSessionReady = async (readyTeam, readyMember) => {
    setTeam(readyTeam);
    setCurrentMember(readyMember);
    setIsExamStarted(true);
    await enterFullscreen();
  };

  // 6. Dynamic Team-Level Problem Purchase
  const handlePurchaseProblem = async (problemId, bidAmount, password) => {
    if (!team?.name) return;
    const res = await purchaseProblem({
      teamName: team.name,
      memberId: currentMember?.memberId,
      problemId,
      bidAmount,
      password
    });

    if (res.team) {
      setTeam(res.team);
    }
    // Refresh prices and problems
    loadProblemsAndPrices();
    return res;
  };

  // 7. Select Problem & notify teammates in shared workspace
  const handleSelectProblem = (id) => {
    setCurrentProblemId(id);
    if (team?.name && currentMember?.memberId && id) {
      notifyMemberWorking({
        teamName: team.name,
        memberId: currentMember.memberId,
        problemId: id
      });
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'MEMBER_WORKING',
          teamName: team.name,
          memberId: currentMember.memberId,
          problemId: id
        }));
      }
    }
  };

  // 8. Code State per Member Session
  const currentKey = `${currentProblemId}|${lang}`;
  const currentCode = codeMap[currentKey] ?? DEFAULT_TEMPLATES[lang] ?? '';

  const handleCodeChange = (newCode) => {
    setCodeMap(prev => ({ ...prev, [currentKey]: newCode }));
  };

  const handleRunCode = async ({ lang, code, stdin, memberId, problemId }) => {
    return await runCodeAsync({
      teamName: team?.name,
      memberId: memberId || currentMember?.memberId,
      lang,
      code,
      stdin,
      problemId: problemId || currentProblemId
    });
  };

  const handleSubmitCode = async ({ problemId, lang, code, memberId }) => {
    const res = await submitCodeAsync({
      teamName: team.name,
      memberId: memberId || currentMember?.memberId,
      problemId,
      lang,
      code
    });
    // Immediately refresh team state after submission
    const refreshed = await getTeamStatus(team.name);
    if (refreshed.team) {
      setTeam(refreshed.team);
    }
    return res;
  };

  const activeProblem = problems.find(p => p.id === currentProblemId);
  const activeProblemStatus = activeProblem ? (team?.problemStatuses?.[activeProblem.id] || null) : null;

  // Dedicated Admin Portal Route (/admin) — fully separate from the participant site.
  // Participants never link here; organisers navigate to /admin directly.
  if (viewMode === 'admin') {
    if (isAdminLoggedIn) {
      return (
        <AdminDashboard
          onLogout={() => {
            adminLogout();
            setIsAdminLoggedIn(false);
          }}
          onSwitchToWorkspace={() => {
            window.location.assign('/');
          }}
        />
      );
    }
    return (
      <AdminLogin
        onLoginSuccess={() => {
          setIsAdminLoggedIn(true);
        }}
        onBackToWorkspace={() => {
          window.location.assign('/');
        }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Navigation Header */}
      <Header
        team={team}
        currentMember={currentMember}
        eventSettings={eventSettings}
        onOpenLeaderboard={() => setShowLeaderboard(true)}
        onOpenTransactions={() => setShowTransactions(true)}
        onToggleFullscreen={enterFullscreen}
      />

      {/* Live strip of active sabotage effects (server-timed, survives refresh) */}
      {isExamStarted && (team?.effects || []).length > 0 && (
        <EffectBanner effects={team.effects} serverTime={eventSettings?.serverTime || 0} />
      )}

      {/* Main Workspace Layout */}
      <main style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left Sidebar: IDE Project Navigator */}
        <aside style={{
          width: '236px',
          background: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          userSelect: 'none'
        }}>
          {/* Sidebar Header: Team Identity */}
          <div style={{
            padding: '16px 14px 12px',
            borderBottom: '1px solid #e2e8f0'
          }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '0.4px',
              marginBottom: '2px'
            }}>
              {team?.name || 'TEAM WORKSPACE'}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: '#64748b'
            }}>
              <span>Shared Workspace</span>
              <span style={{
                fontSize: '11px',
                color: '#475569',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                padding: '2px 7px',
                borderRadius: '6px',
                fontWeight: 600
              }}>
                {(team?.members?.length || team?.size || 1)} Member{(team?.members?.length || team?.size || 1) !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Problem Tree List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px'
          }}>
            {/* Section: UNLOCKED */}
            <div style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '1px',
              color: '#64748b',
              padding: '6px 8px 4px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>UNLOCKED</span>
              <span style={{ fontSize: '11px', fontWeight: 700, background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', color: '#0f172a' }}>
                {(team?.unlocked || []).length}
              </span>
            </div>

            {(team?.unlocked || []).map((id) => {
              const prob = problems.find(p => p.id === id);
              const isSolved = (team?.solved || []).includes(id);
              const isActive = currentProblemId === id;

              return (
                <div
                  key={id}
                  onClick={() => handleSelectProblem(id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isActive ? 700 : (isSolved ? 600 : 500),
                    color: isActive ? '#7c3aed' : (isSolved ? '#047857' : '#0f172a'),
                    background: isActive ? '#f5f3ff' : 'transparent',
                    borderLeft: isActive ? '3px solid #7c3aed' : '3px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.12s ease',
                    minWidth: 0
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = '#f8fafc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                  title={`${id} — ${prob?.title || id}`}
                >
                  <span style={{
                    fontSize: '12px',
                    color: isSolved ? '#16a34a' : (isActive ? '#7c3aed' : '#94a3b8'),
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {isSolved ? '✓' : '●'}
                  </span>
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {id} &nbsp;{prob?.title || id}
                  </span>
                </div>
              );
            })}

            {(!team?.unlocked || team.unlocked.length === 0) && (
              <div style={{
                fontSize: '12px',
                color: '#94a3b8',
                padding: '8px 10px',
                fontStyle: 'italic'
              }}>
                No unlocked problems yet.
              </div>
            )}
          </div>

          {/* Bottom Catalog Action */}
          <div style={{
            padding: '12px',
            borderTop: '1px solid #e2e8f0',
            background: '#ffffff'
          }}>
            <button
              className={!currentProblemId ? "btn-primary" : "btn-ghost"}
              onClick={() => setCurrentProblemId(null)}
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                justifyContent: 'center'
              }}
            >
              My Problems ({(team?.unlocked || []).length})
            </button>
          </div>
        </aside>

        {/* Center / Right Content: Editor OR Problem Catalog */}
        {currentProblemId && activeProblem ? (
          <CodeEditorPane
            problem={activeProblem}
            lang={lang}
            onLangChange={setLang}
            code={currentCode}
            onCodeChange={handleCodeChange}
            onRunCode={handleRunCode}
            onSubmitCode={handleSubmitCode}
            currentMember={currentMember}
            team={team}
            onTeamUpdated={setTeam}
            problemStatus={activeProblemStatus}
            reportViolation={reportViolation}
            internalClipboardRef={internalClipboardRef}
          />
        ) : (
          <ProblemCatalog
            problems={problems}
            problemPrices={problemPrices}
            unlockedIds={team?.unlocked || []}
            solvedIds={team?.solved || []}
            problemStatuses={team?.problemStatuses || {}}
            teamBalance={team?.balance ?? 1000}
            currentMember={currentMember}
            team={team}
            eventSettings={eventSettings}
            onTeamUpdated={setTeam}
            onSelectProblem={handleSelectProblem}
            onPurchaseProblem={handlePurchaseProblem}
          />
        )}
      </main>

      {/* Mandatory Exam Entrance Gate (Team Registration & Member Selection) */}
      {!isExamStarted && (
        <GateModal
          onTeamSessionReady={handleTeamSessionReady}
        />
      )}

      {/* Sabotage Freeze Overlay (full screen lockout with real-time countdown) */}
      {isExamStarted && team?.frozenUntil && team.frozenUntil > Date.now() && (
        <SabotageFreezeOverlay
          team={team}
          onFreezeExpired={() => {
            setTeam(prev => prev ? { ...prev, frozenUntil: null, frozenBy: null } : prev);
          }}
        />
      )}

      {/* Blackout wild card: screen goes dark while the code keeps running */}
      {isExamStarted && (() => {
        const blackout = (team?.effects || []).find(e => e.cardId === 'BLACKOUT');
        return blackout ? (
          <BlackoutOverlay endsAt={blackout.endsAt} serverTime={eventSettings?.serverTime || 0} />
        ) : null;
      })()}

      {/* Lock Overlay (Anti-cheat lockout screen with Organiser PIN) */}
      {isExamStarted && team?.isLocked && (
        <LockOverlay
          teamName={team.name}
          reason={team.lockReason}
          onUnlocked={(unlockedTeam) => setTeam(unlockedTeam)}
        />
      )}

      {/* Live Ranked Scoreboard */}
      {showLeaderboard && (
        <LeaderboardModal onClose={() => setShowLeaderboard(false)} />
      )}

      {/* Team Purchases & Invoices Modal */}
      {showTransactions && (
        <TransactionsModal
          team={team}
          onClose={() => setShowTransactions(false)}
        />
      )}
    </div>
  );
}
