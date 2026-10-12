import React, { useState, useRef, useEffect } from 'react';
import { Play, Send, RotateCcw, Loader2, CheckCircle, AlertTriangle, XCircle, Terminal, Lightbulb, Zap, Snowflake, Lock, Unlock, Eye, Bot, Ban } from 'lucide-react';
import { useHintPass, useAiDebug } from '../services/api';

const STARTER_TEMPLATES = {
  python: `import sys\n\ndef main():\n    data = sys.stdin.read().split()\n    # TODO: parse input, solve, print output\n    print()\n\nif __name__ == "__main__":\n    main()\n`,
  c: `#include <stdio.h>\n\nint main() {\n    // TODO: read input with scanf, solve, print with printf\n    return 0;\n}\n`,
  cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(null);\n    // TODO: read input with cin, solve, print with cout\n    return 0;\n}\n`,
  java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        // TODO: read input, solve, print output\n    }\n}\n`
};

const WORKING_SOLUTIONS = {
  E1: {
    python: `import sys\n\ndef main():\n    d = sys.stdin.read().split()\n    if not d:\n        return\n    n, t = int(d[0]), int(d[1])\n    nums = [int(x) for x in d[2:n+2]]\n    seen = {}\n    for i, x in enumerate(nums):\n        if (t - x) in seen:\n            print(f"{seen[t - x]} {i}")\n            return\n        seen[x] = i\n\nif __name__ == "__main__":\n    main()\n`,
    cpp: `#include <iostream>\n#include <vector>\n#include <unordered_map>\n\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n;\n    long long t;\n    if (cin >> n >> t) {\n        unordered_map<long long, int> seen;\n        for (int i = 0; i < n; i++) {\n            long long x;\n            cin >> x;\n            if (seen.count(t - x)) {\n                cout << seen[t - x] << " " << i << endl;\n                return 0;\n            }\n            seen[x] = i;\n        }\n    }\n    return 0;\n}\n`,
    java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            long t = sc.nextLong();\n            Map<Long, Integer> seen = new HashMap<>();\n            for (int i = 0; i < n; i++) {\n                long x = sc.nextLong();\n                if (seen.containsKey(t - x)) {\n                    System.out.println(seen.get(t - x) + " " + i);\n                    return;\n                }\n                seen.put(x, i);\n            }\n        }\n    }\n}\n`
  },
  LC1: {
    python: `import sys\n\ndef main():\n    d = sys.stdin.read().split()\n    if not d:\n        return\n    n, t = int(d[0]), int(d[1])\n    nums = [int(x) for x in d[2:n+2]]\n    seen = {}\n    for i, x in enumerate(nums):\n        if (t - x) in seen:\n            print(f"{seen[t - x]} {i}")\n            return\n        seen[x] = i\n\nif __name__ == "__main__":\n    main()\n`,
    cpp: `#include <iostream>\n#include <vector>\n#include <unordered_map>\n\nusing namespace std;\n\nint main() {\n    ios::sync_with_stdio(false);\n    cin.tie(nullptr);\n    int n;\n    long long t;\n    if (cin >> n >> t) {\n        unordered_map<long long, int> seen;\n        for (int i = 0; i < n; i++) {\n            long long x;\n            cin >> x;\n            if (seen.count(t - x)) {\n                cout << seen[t - x] << " " << i << endl;\n                return 0;\n            }\n            seen[x] = i;\n        }\n    }\n    return 0;\n}\n`,
    java: `import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int n = sc.nextInt();\n            long t = sc.nextLong();\n            Map<Long, Integer> seen = new HashMap<>();\n            for (int i = 0; i < n; i++) {\n                long x = sc.nextLong();\n                if (seen.containsKey(t - x)) {\n                    System.out.println(seen.get(t - x) + " " + i);\n                    return;\n                }\n                seen.put(x, i);\n            }\n        }\n    }\n}\n`
  }
};

export function CodeEditorPane({
  problem,
  lang,
  onLangChange,
  code,
  onCodeChange,
  onRunCode,
  onSubmitCode,
  currentMember,
  team,
  onTeamUpdated,
  problemStatus,
  reportViolation,
  internalClipboardRef
}) {
  const [stdin, setStdin] = useState(problem?.si || '');
  const [outputResult, setOutputResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allowPaste, setAllowPaste] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintError, setHintError] = useState('');
  const [aiDebugOutput, setAiDebugOutput] = useState(null);
  const [aiDebugLoading, setAiDebugLoading] = useState(false);
  const [effectNotice, setEffectNotice] = useState('');

  const isFrozen = Boolean(team?.frozenUntil && team.frozenUntil > Date.now());
  const isHintCardUnlocked = Boolean(team?.unlockedCards?.includes('HINT') || team?.hintUnlocked);
  const hasHintPass = (team?.hintPassesCount || 0) > 0;

  // Wild card effects on this team (server-timed, delivered with team state)
  const effects = team?.effects || [];
  const hasEffect = (cardId) => effects.some(e => e.cardId === cardId);
  const noBackspace = hasEffect('NO_BACKSPACE');
  const tinyFont = hasEffect('TINY_FONT');
  const noAutocomplete = hasEffect('NO_AUTOCOMPLETE');
  const langLock = team?.languageLock?.active ? team.languageLock.lang : null;
  const aiDebugGrant = team?.aiDebug?.[problem?.id];
  const peekedTest = team?.peekedTests?.[problem?.id];

  const handleUseAiDebug = async () => {
    if (!problem?.id || !team?.name) return;
    if (!window.confirm('Use your one-time AI Debug on this problem? It cannot be used again.')) return;
    setAiDebugLoading(true);
    try {
      const res = await useAiDebug({
        teamName: team.name,
        memberId: currentMember?.memberId,
        problemId: problem.id
      });
      setAiDebugOutput(res.analysis);
    } catch (err) {
      setAiDebugOutput(`AI Debug failed: ${err.message}`);
    } finally {
      setAiDebugLoading(false);
    }
  };

  const handleUseHintPassDirect = async () => {
    if (!problem?.id || !team?.name) return;
    setHintLoading(true);
    setHintError('');
    try {
      const res = await useHintPass({
        teamName: team.name,
        memberId: currentMember?.memberId,
        problemId: problem.id
      });
      if (onTeamUpdated && res.team) {
        onTeamUpdated(res.team);
      }
    } catch (err) {
      setHintError(err.message || 'Failed to unlock hint.');
    } finally {
      setHintLoading(false);
    }
  };

  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const prevCodeLenRef = useRef(code.length);
  const bulkAllowedRef = useRef(false);

  // Sync custom input with problem sample input when problem changes
  useEffect(() => {
    if (problem?.si) {
      setStdin(problem.si);
    }
    setOutputResult(null);
    setAiDebugOutput(null);
  }, [problem?.id]);

  // Sync line number gutter with code textarea
  const lineCount = (code || '').split('\n').length;
  const gutterLines = Array.from({ length: Math.max(1, lineCount) }, (_, i) => i + 1).join('\n');

  const handleScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    // No Backspace wild card: Backspace & Delete are blocked (server-timed effect)
    if (noBackspace && (e.key === 'Backspace' || e.key === 'Delete')) {
      e.preventDefault();
      setEffectNotice('⌫ No Backspace effect is active — you cannot delete characters right now.');
      setTimeout(() => setEffectNotice(''), 2500);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = code.substring(0, start) + '    ' + code.substring(end);
      onCodeChange(newCode);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  const handleInput = (e) => {
    const newCode = e.target.value;
    const delta = newCode.length - prevCodeLenRef.current;

    // Detect bulk insertion without paste permission (>40 chars added in 1 event)
    if (delta > 40 && !bulkAllowedRef.current && !allowPaste) {
      reportViolation('BULK_TEXT_INSERTION', `Blocked abnormal bulk text insertion of ${delta} characters.`);
      e.target.value = code; // Revert
      return;
    }

    prevCodeLenRef.current = newCode.length;
    onCodeChange(newCode);
  };

  // Anti-Cheat: Intercept copy / paste to detect unauthorized external copy-paste
  const handleCopy = (e) => {
    e.preventDefault();
    const target = textareaRef.current;
    if (target) {
      const selectedText = target.value.substring(target.selectionStart, target.selectionEnd);
      internalClipboardRef.current = selectedText;
    }
  };

  const handleCut = (e) => {
    e.preventDefault();
    const target = textareaRef.current;
    if (target) {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      internalClipboardRef.current = target.value.substring(start, end);
      const newCode = target.value.substring(0, start) + target.value.substring(end);
      bulkAllowedRef.current = true;
      onCodeChange(newCode);
      bulkAllowedRef.current = false;
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const clipboardText = e.clipboardData ? e.clipboardData.getData('text') : '';

    // If paste is allowed (Dev / Testing mode)
    if (allowPaste) {
      if (clipboardText) {
        const target = textareaRef.current;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const newCode = target.value.substring(0, start) + clipboardText + target.value.substring(end);
        bulkAllowedRef.current = true;
        onCodeChange(newCode);
        bulkAllowedRef.current = false;
      }
      return;
    }

    // If clipboard differs from internal copy buffer, flag it as external insertion!
    if (clipboardText && clipboardText !== internalClipboardRef.current) {
      reportViolation(
        'EXTERNAL_PASTE_ATTEMPT',
        `Blocked attempt to paste external code (${clipboardText.length} characters).`
      );
    } else if (internalClipboardRef.current) {
      // Paste allowed internal text
      const target = textareaRef.current;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newCode = target.value.substring(0, start) + internalClipboardRef.current + target.value.substring(end);
      bulkAllowedRef.current = true;
      onCodeChange(newCode);
      bulkAllowedRef.current = false;
    }
  };

  const handleLoadSolution = () => {
    const sol = WORKING_SOLUTIONS[problem?.id]?.[lang];
    if (sol) {
      bulkAllowedRef.current = true;
      onCodeChange(sol);
      bulkAllowedRef.current = false;
      setOutputResult(null);
    } else {
      alert(`No preloaded solution for ${problem?.id} in ${lang}`);
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset code to starter template?')) {
      onCodeChange(STARTER_TEMPLATES[lang] || '');
      setOutputResult(null);
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutputResult({ status: 'QUEUED', message: 'Job enqueued on runner worker pool...' });
    try {
      const res = await onRunCode({ lang, code, stdin, memberId: currentMember?.memberId, problemId: problem?.id });
      const resultData = res?.result || res?.data || {};

      const stdout = resultData.stdout !== undefined ? resultData.stdout : (resultData.output || '');
      const stderr = resultData.stderr || '';

      const norm = (s) => (s || '').trim().replace(/\r\n/g, '\n');
      const normStdin = norm(stdin);
      const normSampleIn = norm(problem?.si);
      const expectedOut = norm(problem?.eo || problem?.so);

      let isCorrect = null;
      let expected = null;

      // If stdin matches problem sample input or is blank, compare against sample expected output
      if (normStdin === normSampleIn || !normStdin) {
        expected = expectedOut;
        const normActual = norm(stdout);
        isCorrect = Boolean(expected && normActual === expected && normActual.length > 0);
      }

      setOutputResult({
        status: res?.status || 'COMPLETED',
        type: 'run',
        data: {
          ...resultData,
          stdout,
          stderr,
          expected,
          isCorrect
        },
        error: res?.error
      });
    } catch (err) {
      setOutputResult({
        status: 'FAILED',
        error: err.message || 'Execution failed'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    // Spec B7: exact confirmation before the final submission.
    const priorAttempts = (team?.problemWrong?.[problem.id] || problemStatus?.wrongSubmissions || 0);
    const message = priorAttempts > 0
      ? `This is your final submission. Extra attempts cost -10. (Attempt #${priorAttempts + 1} on ${problem.id} — submit now?)`
      : `This is your final submission. Extra attempts cost -10. Submit ${problem.id} now?`;
    if (!window.confirm(message)) {
      return;
    }
    setIsSubmitting(true);
    setOutputResult({ status: 'QUEUED', message: 'Submission queued for server-side evaluation...' });
    try {
      const res = await onSubmitCode({ problemId: problem.id, lang, code, memberId: currentMember?.memberId });
      const resultData = res?.result || res?.data || {};

      const norm = (s) => (s || '').trim().replace(/\r\n/g, '\n');
      const stdout = resultData.stdout !== undefined ? resultData.stdout : (resultData.output || '');
      const expected = norm(problem?.eo || problem?.so);
      const passed = Boolean(resultData.passed);

      setOutputResult({
        status: res?.status || 'COMPLETED',
        type: 'submit',
        data: {
          ...resultData,
          stdout,
          expected,
          isCorrect: passed
        },
        error: res?.error
      });
    } catch (err) {
      setOutputResult({
        status: 'FAILED',
        error: err.message || 'Submission failed'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* Left Pane: Problem Statement */}
      <div style={{
        width: '420px',
        borderRight: '1px solid #e2e8f0',
        overflowY: 'auto',
        padding: '24px',
        background: '#ffffff',
        flexShrink: 0
      }}>
        {/* Title & Difficulty Row */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: '#64748b',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              padding: '2px 8px',
              borderRadius: '4px'
            }}>
              {problem.cat || 'Algorithms'}
            </span>
            <span className={`badge ${problem.diff}`}>
              {problem.diff} · {problem.diff === 'Hard' ? 400 : (problem.diff === 'Medium' ? 300 : 200)} pts
            </span>

            {/* Wrong submissions counter & penalty */}
            {(team?.problemWrong?.[problem.id] || problemStatus?.wrongSubmissions || 0) > 0 && (
              <span style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 600
              }}>
                {(team?.problemWrong?.[problem.id] || problemStatus?.wrongSubmissions)} WA (−{(team?.problemWrong?.[problem.id] || problemStatus?.wrongSubmissions) * 10} pts)
              </span>
            )}
          </div>

          <h1 style={{ margin: 0, color: '#0f172a', fontSize: '20px', fontWeight: 700, letterSpacing: '0.2px' }}>
            {problem.id} — {problem.title}
          </h1>
        </div>

        {/* 💡 Blue Hint Card / Unlock Hint Button */}
        {team?.revealedHints?.[problem.id] ? (
          <div
            className="card-unlocked-reveal"
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '14px 16px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 700, fontSize: '12px' }}>
                <Lightbulb size={15} /> Algorithmic Hint
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Unlocked by {team.revealedHints[problem.id].revealedByName || team.revealedHints[problem.id].revealedBy}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#1e3a8a', lineHeight: 1.55 }}>
              {team.revealedHints[problem.id].hint}
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            border: '1px dashed #cbd5e1',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '18px'
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} /> Locked Algorithmic Hint
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                {isHintCardUnlocked && hasHintPass
                  ? `Your team has ${team.hintPassesCount} Hint Pass available.`
                  : 'Hint is locked by Administrator. Admin unlock or unlocked Hint Pass required.'}
              </div>
            </div>
            {isHintCardUnlocked && hasHintPass ? (
              <button
                type="button"
                className="btn-blue"
                onClick={handleUseHintPassDirect}
                disabled={hintLoading}
                style={{
                  fontSize: '11px',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontWeight: 600,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none'
                }}
              >
                {hintLoading ? 'Revealing...' : `💡 Use Hint Pass (${team.hintPassesCount})`}
              </button>
            ) : (
              <span style={{
                fontSize: '11px',
                color: '#64748b',
                padding: '5px 10px',
                borderRadius: '6px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <Lock size={12} /> Locked (Admin Control)
              </span>
            )}
          </div>
        )}

        {hintError && (
          <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '12px', marginBottom: '14px' }}>
            {hintError}
          </div>
        )}

        {/* Shared Team Workspace Status Banner */}
        {problemStatus?.status === 'SOLVED' && (
          <div style={{
            padding: '10px 14px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '6px',
            color: '#047857',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle size={16} />
            <span>Solved by {problemStatus.solvedByName || problemStatus.solvedBy}</span>
          </div>
        )}

        {problemStatus?.status === 'IN_PROGRESS' && problemStatus.workingBy !== currentMember?.memberId && (
          <div style={{
            padding: '10px 14px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            color: '#b45309',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertTriangle size={16} />
            <span>Teammate {problemStatus.workingBy} is currently editing this problem</span>
          </div>
        )}

        {/* Problem Specification Content */}
        <div style={specSectionStyle}>
          <div style={labelStyle}>Description</div>
          <p style={{ margin: '6px 0', whiteSpace: 'pre-line', color: '#334155', lineHeight: 1.6, fontSize: '13px' }}>
            {problem.desc}
          </p>
        </div>

        <div style={specSectionStyle}>
          <div style={labelStyle}>Constraints</div>
          <pre style={codeBlockStyle}>{problem.con || 'Standard limits'}</pre>
        </div>

        <div style={specSectionStyle}>
          <div style={labelStyle}>Sample Input</div>
          <pre style={codeBlockStyle}>{problem.si || '(None)'}</pre>
        </div>

        <div style={specSectionStyle}>
          <div style={labelStyle}>Sample Output</div>
          <pre style={codeBlockStyle}>{problem.so || '(None)'}</pre>
        </div>

        {/* Peeked hidden test (revealed by the Peek wild card) */}
        {peekedTest && (
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
            padding: '12px 14px', marginBottom: '18px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: '#b45309', letterSpacing: '0.6px', marginBottom: '6px' }}>
              <Eye size={13} /> PEEKED HIDDEN TEST (via Peek wild card)
            </div>
            <div style={codeBlockStyle}>
              <div style={{ color: '#92400e', fontWeight: 700 }}>Hidden Input:</div>
              <pre style={{ margin: '2px 0 8px', font: '12px var(--font-mono)', whiteSpace: 'pre-wrap' }}>{peekedTest.input || '(empty input)'}</pre>
              <div style={{ color: '#92400e', fontWeight: 700 }}>Expected Output:</div>
              <pre style={{ margin: '2px 0 0', font: '12px var(--font-mono)', whiteSpace: 'pre-wrap' }}>{peekedTest.expected || '(none)'}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Right Pane: Code Editor + Runner & Terminal (Largest Visual Area) */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: '#f8fafc',
        padding: '16px 20px',
        gap: '12px'
      }}>
        {/* Editor Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            value={langLock ? langLock : lang}
            onChange={(e) => onLangChange(e.target.value)}
            disabled={Boolean(langLock)}
            title={langLock ? `Language Lock: you must use ${langLock.toUpperCase()} until your next solve` : 'Select language'}
            style={{
              width: 'auto',
              minWidth: '130px',
              background: langLock ? '#fffbeb' : '#ffffff',
              border: langLock ? '1px solid #fde68a' : '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '13px',
              color: '#0f172a'
            }}
          >
            {langLock && <option value={langLock}>{langLock.toUpperCase()} (LOCKED 🔡)</option>}
            <option value="python">Python 3</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>

          <button className="btn-ghost" onClick={handleReset} title="Reset starter code" style={{ fontSize: '12px', background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155' }}>
            <RotateCcw size={13} /> Reset
          </button>

          <button
            className="btn-ghost"
            onClick={handleLoadSolution}
            title="Auto-fill passing solution for testing"
            style={{
              fontSize: '12px',
              color: '#2563eb',
              background: '#eff6ff',
              border: '1px solid #bfdbfe'
            }}
          >
            ⚡ Load Solution
          </button>

          <button
            className="btn-ghost"
            onClick={() => setAllowPaste(!allowPaste)}
            title={allowPaste ? "Paste is allowed" : "Paste is strict (Exam Mode)"}
            style={{
              fontSize: '11px',
              color: allowPaste ? '#d97706' : '#64748b',
              background: '#ffffff',
              border: '1px solid #cbd5e1'
            }}
          >
            {allowPaste ? '🔓 Paste: Dev' : '🔒 Paste: Strict'}
          </button>

          {/* AI Debug wild card (one-time use, granted by the organizer) */}
          {aiDebugGrant && !aiDebugGrant.used && (
            <button
              className="btn-ghost"
              onClick={handleUseAiDebug}
              disabled={aiDebugLoading}
              title="One-time AI Debug analysis on this problem"
              style={{
                fontSize: '11px',
                color: '#7c3aed',
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                fontWeight: 700
              }}
            >
              {aiDebugLoading ? <Loader2 size={12} className="spin" /> : <Bot size={12} />}
              AI Debug
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Action Buttons */}
          <button
            className="btn-ghost"
            onClick={handleRun}
            disabled={isRunning || isSubmitting || isFrozen}
            title={isFrozen ? "Screen is frozen" : "Run code against sample test"}
            style={{
              padding: '7px 16px',
              fontSize: '13px',
              borderRadius: '6px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a'
            }}
          >
            {isRunning ? <Loader2 size={14} className="spin" /> : isFrozen ? <Zap size={14} color="#ef4444" /> : <Play size={14} />}
            {isFrozen ? 'Frozen' : 'Run Code'}
          </button>

          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={isRunning || isSubmitting || isFrozen}
            title={isFrozen ? "Screen is frozen" : "Submit solution for scoring"}
            style={{
              padding: '7px 18px',
              fontSize: '13px',
              borderRadius: '6px'
            }}
          >
            {isSubmitting ? <Loader2 size={14} className="spin" /> : isFrozen ? <Zap size={14} /> : <Send size={14} />}
            {isFrozen ? 'Frozen' : 'Submit Solution'}
          </button>
        </div>

        {/* Code Editor with Line Number Gutter */}
        <div style={{
          flex: 1,
          minHeight: '260px',
          display: 'flex',
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          background: '#ffffff',
          overflow: 'hidden'
        }}>
          <pre
            ref={gutterRef}
            style={{
              width: '46px',
              textAlign: 'right',
              padding: '12px 10px 12px 0',
              margin: 0,
              color: '#94a3b8',
              background: '#f8fafc',
              userSelect: 'none',
              overflow: 'hidden',
              font: tinyFont ? '10px/14px var(--font-mono)' : '13px/20px var(--font-mono)',
              borderRight: '1px solid #e2e8f0'
            }}
          >
            {gutterLines}
          </pre>

          <textarea
            ref={textareaRef}
            value={code}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            spellCheck="false"
            wrap="off"
            style={{
              flex: 1,
              border: 0,
              borderRadius: 0,
              background: 'transparent',
              color: '#0f172a',
              font: tinyFont ? '10px/14px var(--font-mono)' : '13px/20px var(--font-mono)',
              padding: '12px 14px',
              resize: 'none',
              outline: 'none',
              tabSize: 4
            }}
          />
        </div>

        {/* Wild card effect notices (No Backspace etc.) */}
        {(effectNotice || noBackspace || noAutocomplete) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700,
            background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c'
          }}>
            <Ban size={13} />
            {effectNotice || 'Editor restrictions active from a rival wild card (see the banner above).'}
          </div>
        )}

        {/* AI Debug output (one-time wild card use) */}
        {aiDebugOutput && (
          <div style={{
            background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '8px',
            padding: '12px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 800, color: '#7c3aed', letterSpacing: '0.6px', marginBottom: '6px' }}>
              <Bot size={13} /> AI DEBUG ANALYSIS (ONE-TIME USE — CONSUMED)
            </div>
            <pre style={{ margin: 0, fontSize: '12.5px', color: '#4c1d95', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6 }}>
              {aiDebugOutput}
            </pre>
          </div>
        )}

        {/* Custom Input */}
        <div>
          <div style={labelStyle}>Custom Input (stdin)</div>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            spellCheck="false"
            rows={2}
            style={{
              width: '100%',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              borderRadius: '6px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              resize: 'vertical',
              padding: '8px 12px'
            }}
          />
        </div>

        {/* Terminal Execution Output Drawer */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '14px 18px',
          minHeight: '130px',
          maxHeight: '260px',
          overflowY: 'auto',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
            color: '#64748b',
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Terminal size={13} /> Execution Output
            </div>
            {outputResult && outputResult.status === 'COMPLETED' && outputResult.data && (
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'none',
                letterSpacing: 'normal',
                color: outputResult.data.compileError
                  ? '#b91c1c'
                  : outputResult.data.isCorrect === true
                  ? '#047857'
                  : outputResult.data.isCorrect === false
                  ? '#b91c1c'
                  : '#2563eb'
              }}>
                {outputResult.data.compileError
                  ? 'Compilation Failed'
                  : outputResult.data.isCorrect === true
                  ? 'Status: Correct'
                  : outputResult.data.isCorrect === false
                  ? 'Status: Wrong Answer'
                  : 'Status: Completed'}
              </span>
            )}
          </div>

          {!outputResult && (
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>
              Run or submit your code to view console output and test verdicts…
            </div>
          )}

          {outputResult && outputResult.status === 'QUEUED' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706', fontSize: '13px', padding: '12px 0' }}>
              <Loader2 size={16} className="spin" />
              <span>{outputResult.message || 'Executing code on runner pool...'}</span>
            </div>
          )}

          {outputResult && outputResult.data && outputResult.status !== 'QUEUED' && (
            <div>
              {/* Status Verdict Strip */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                borderRadius: '6px',
                marginBottom: '12px',
                fontSize: '13px',
                fontWeight: 600,
                background: outputResult.data.compileError
                  ? '#fef2f2'
                  : outputResult.data.isCorrect === true
                  ? '#ecfdf5'
                  : outputResult.data.isCorrect === false
                  ? '#fef2f2'
                  : '#eff6ff',
                color: outputResult.data.compileError
                  ? '#b91c1c'
                  : outputResult.data.isCorrect === true
                  ? '#047857'
                  : outputResult.data.isCorrect === false
                  ? '#b91c1c'
                  : '#2563eb',
                border: `1px solid ${
                  outputResult.data.compileError
                    ? '#fecaca'
                    : outputResult.data.isCorrect === true
                    ? '#a7f3d0'
                    : outputResult.data.isCorrect === false
                    ? '#fecaca'
                    : '#bfdbfe'
                }`
              }}>
                {outputResult.data.compileError ? (
                  <>
                    <XCircle size={16} />
                    <span>Compilation Error</span>
                  </>
                ) : outputResult.data.isCorrect === true ? (
                  <>
                    <CheckCircle size={16} />
                    <span>Correct {outputResult.type === 'submit' ? '— ACCEPTED' : '(Matches Expected Output)'}</span>
                  </>
                ) : outputResult.data.isCorrect === false ? (
                  <>
                    <XCircle size={16} />
                    <span>Wrong {outputResult.type === 'submit' ? 'Answer' : '(Output Mismatch)'}</span>
                  </>
                ) : (
                  <>
                    <Terminal size={16} />
                    <span>Program Executed Successfully</span>
                  </>
                )}

                {outputResult.type === 'submit' && (
                  <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 500 }}>
                    {outputResult.data.passed
                      ? `+${problem.diff === 'Hard' ? 400 : (problem.diff === 'Medium' ? 300 : 200)} Difficulty Points Awarded`
                      : `−10 WA Penalty (Passed ${outputResult.data.hiddenPassed || 0} / ${outputResult.data.totalHidden || 3})`}
                  </span>
                )}
              </div>

              {/* Output Comparison Grid: Your Output (Always Shown) vs Expected Output */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: outputResult.data.expected ? '1fr 1fr' : '1fr',
                gap: '12px',
                marginBottom: '8px'
              }}>
                {/* Box A: YOUR OUTPUT */}
                <div style={{
                  background: '#f8fafc',
                  border: `1px solid ${outputResult.data.isCorrect === false ? '#fecaca' : '#e2e8f0'}`,
                  borderRadius: '6px',
                  padding: '10px 12px'
                }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    marginBottom: '6px'
                  }}>
                    Your Output
                  </div>
                  <pre style={{
                    margin: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: outputResult.data.isCorrect === false ? '#b91c1c' : '#0f172a',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all'
                  }}>
                    {outputResult.data.stdout || outputResult.data.output || '(Program exited with no standard output)'}
                  </pre>
                </div>

                {/* Box B: EXPECTED OUTPUT */}
                {outputResult.data.expected && (
                  <div style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '6px',
                    padding: '10px 12px'
                  }}>
                    <div style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#047857',
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                      marginBottom: '6px'
                    }}>
                      Expected Output
                    </div>
                    <pre style={{
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: '#065f46',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}>
                      {outputResult.data.expected}
                    </pre>
                  </div>
                )}
              </div>

              {/* Details explanation if submit failure or diff info */}
              {outputResult.data.details && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
                  {outputResult.data.details}
                </div>
              )}

              {/* Stderr Diagnostics */}
              {outputResult.data.stderr && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca'
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#b91c1c', marginBottom: '4px' }}>
                    STDERR / COMPILER DIAGNOSTICS:
                  </div>
                  <pre style={{ margin: 0, fontSize: '12px', color: '#b91c1c', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
                    {outputResult.data.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}

          {outputResult && outputResult.error && (
            <div style={{ color: '#b91c1c', fontSize: '13px', marginTop: '6px' }}>
              ⚠ {outputResult.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const specSectionStyle = {
  marginBottom: '18px'
};

const labelStyle = {
  fontSize: '11px',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  fontWeight: 700,
  marginBottom: '4px'
};

const codeBlockStyle = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  padding: '8px 12px',
  margin: '4px 0 0',
  font: '12px var(--font-mono)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: '#0f172a'
};
