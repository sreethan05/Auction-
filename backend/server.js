import 'dotenv/config';
import express from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './database.js';
import { executionQueue } from './queue.js';
import { syncTeamToSupabase, fetchTeamsFromSupabase, isSupabaseReady, parseSheetRowsToTeams, getSupabaseClient } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

const app = express();
const PORT = process.env.PORT || 8765;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Track connected sockets:
// Proctors: Set<WebSocket>
const proctorClients = new Set();
// Teams: Map<teamNameLower, Set<WebSocket>>
const teamClients = new Map();

function getTeamSocketSet(teamName) {
  const key = (teamName || '').trim().toLowerCase();
  if (!teamClients.has(key)) {
    teamClients.set(key, new Set());
  }
  return teamClients.get(key);
}

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  let joinedTeamKey = null;

  if (url.includes('/proctor')) {
    // Proctor channel is admin-only: require ?token=<admin session token>
    let wsToken = '';
    try {
      wsToken = new URL(url, 'http://localhost').searchParams.get('token') || '';
    } catch (e) {}
    if (!isValidAdminToken(wsToken)) {
      ws.close(4001, 'Admin authentication required for proctor channel');
      return;
    }
    proctorClients.add(ws);
    // Send initial snapshot
    ws.send(JSON.stringify({
      type: 'INIT_PROCTOR',
      teams: db.getAllTeams(),
      prices: db.getAllPrices(),
      transactions: db.getAllTransactions().slice(0, 50),
      telemetry: db.state.telemetry.slice(0, 50)
    }));
  }

  ws.on('message', (msgRaw) => {
    try {
      const data = JSON.parse(msgRaw.toString());
      if (data.type === 'JOIN_TEAM') {
        const teamKey = (data.teamName || '').trim().toLowerCase();
        joinedTeamKey = teamKey;
        const set = getTeamSocketSet(teamKey);
        set.add(ws);

        const currentTeam = db.getTeam(data.teamName);
        if (currentTeam) {
          ws.send(JSON.stringify({
            type: 'TEAM_WORKSPACE_UPDATED',
            team: enrichTeamForClient(currentTeam)
          }));
        }
      } else if (data.type === 'MEMBER_WORKING') {
        const { teamName, memberId, problemId } = data;
        const updatedTeam = db.setMemberWorking(teamName, memberId, problemId);
        if (updatedTeam) {
          broadcastToTeam(teamName, {
            type: 'TEAM_WORKSPACE_UPDATED',
            team: updatedTeam
          });
          broadcastToProctors({
            type: 'TEAM_UPDATED',
            team: updatedTeam
          });
        }
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    proctorClients.delete(ws);
    if (joinedTeamKey && teamClients.has(joinedTeamKey)) {
      teamClients.get(joinedTeamKey).delete(ws);
    }
  });
});

function broadcastToProctors(payload) {
  const msg = JSON.stringify(payload);
  for (const client of proctorClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) {}
    }
  }
}

// Attach live effects/inventory to any team object leaving the server over WS,
// so participant screens always see current wild card state (survives refresh).
// Login codes never leave the server on participant channels.
function stripSecrets(team) {
  if (!team) return team;
  const { password: _pw, ...safe } = team;
  return safe;
}

function enrichTeamForClient(team) {
  if (!team) return team;
  const fx = db.getTeamActiveEffects(team.name);
  return {
    ...stripSecrets(team),
    effects: fx.effects,
    armedDefenses: fx.armed,
    inventory: db.getTeamInventory(team.name)
  };
}

function broadcastToTeam(teamName, payload) {
  const key = (teamName || '').trim().toLowerCase();
  const set = teamClients.get(key);
  if (!set) return;
  const msg = JSON.stringify(enrichTeamForClientPayload(payload));
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) {}
    }
  }
}

function enrichTeamForClientPayload(payload) {
  if (payload && payload.team) {
    return { ...payload, team: enrichTeamForClient(payload.team) };
  }
  return payload;
}

function broadcastToAll(payload) {
  const msg = JSON.stringify(payload);
  // Send to all team clients and proctor clients
  for (const set of teamClients.values()) {
    for (const client of set) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(msg); } catch (e) {}
      }
    }
  }
  for (const client of proctorClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch (e) {}
    }
  }
}

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: Date.now() });
});

// --- ADMIN AUTHENTICATION (fully separated from participant access) ---
// Credentials come from .env (ADMIN_ID / ADMIN_PASSWORD). Sessions are random
// server-side tokens; every /api/admin/* route except /api/admin/login requires
// a valid "Authorization: Bearer <token>" header.
const ADMIN_ID = process.env.ADMIN_ID || 'Qubit123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Abcd.01@#';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 5 * 60 * 1000;

const adminSessions = new Map(); // token -> expiresAt
const loginAttempts = new Map(); // ip -> { count, lockedUntil }

function sha256(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest();
}

function adminCredentialsValid(adminId, password) {
  const idOk = crypto.timingSafeEqual(sha256(adminId), sha256(ADMIN_ID));
  const pwOk = crypto.timingSafeEqual(sha256(password), sha256(ADMIN_PASSWORD));
  return idOk && pwOk;
}

function issueAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function isValidAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function extractAdminToken(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.headers['x-admin-token'] || '';
}

function requireAdmin(req, res, next) {
  if (!isValidAdminToken(extractAdminToken(req))) {
    return res.status(401).json({ error: 'Admin authentication required. Please log in at /admin.' });
  }
  next();
}

// Guard EVERY /api/admin/* route except the login endpoint itself.
app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login') return next();
  return requireAdmin(req, res, next);
});

function getLoginLock(ip) {
  const lock = loginAttempts.get(ip);
  if (lock && lock.lockedUntil > Date.now()) return lock;
  return null;
}

function recordFailedLogin(ip) {
  const lock = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  lock.count += 1;
  if (lock.count >= MAX_LOGIN_ATTEMPTS) {
    lock.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    lock.count = 0;
  }
  loginAttempts.set(ip, lock);
}

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const lock = getLoginLock(ip);
  if (lock) {
    const secs = Math.ceil((lock.lockedUntil - Date.now()) / 1000);
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${secs}s.` });
  }

  const { adminId, password } = req.body || {};
  if (!adminCredentialsValid(adminId, password)) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid Admin ID or Password. Access denied.' });
  }

  loginAttempts.delete(ip);
  res.json({
    success: true,
    token: issueAdminSession(),
    admin: { id: ADMIN_ID, role: 'HEAD_ADMINISTRATOR' }
  });
});

// --- PROBLEMS & DYNAMIC PRICING API ---
app.get('/api/problems', (req, res) => {
  // STRICT SECURITY: Hidden tests and expected outputs are never exposed!
  res.json({
    problems: db.getPublicProblems(),
    prices: db.getAllPrices()
  });
});

// Dynamic Problem Purchase (Team-level purchase with password verification & winning bid deduction)
app.post('/api/problems/purchase', (req, res) => {
  const { teamName, memberId, problemId, bidAmount, password } = req.body;
  if (!teamName || !problemId) {
    return res.status(400).json({ error: 'Team name and problem ID are required.' });
  }

  try {
    const { team, txn, problem } = db.purchaseProblem(teamName, memberId, problemId, bidAmount, password);

    // Real-time broadcast to all members of this team
    broadcastToTeam(teamName, {
      type: 'TEAM_WORKSPACE_UPDATED',
      team,
      transaction: txn
    });

    // Real-time broadcast to proctors
    broadcastToProctors({
      type: 'TEAM_UPDATED',
      team
    });
    broadcastToProctors({
      type: 'TRANSACTION_LOGGED',
      transaction: txn
    });

    res.json({
      success: true,
      team: stripSecrets(team),
      transaction: txn,
      problem
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Notify that a member is actively working on a problem
app.post('/api/problems/working', (req, res) => {
  const { teamName, memberId, problemId } = req.body;
  if (!teamName || !problemId) {
    return res.status(400).json({ error: 'Missing teamName or problemId' });
  }

  const updatedTeam = db.setMemberWorking(teamName, memberId, problemId);
  if (!updatedTeam) {
    return res.status(404).json({ error: 'Team not found' });
  }

  broadcastToTeam(teamName, {
    type: 'TEAM_WORKSPACE_UPDATED',
    team: updatedTeam
  });
  broadcastToProctors({
    type: 'TEAM_UPDATED',
    team: updatedTeam
  });

  res.json({ success: true, team: stripSecrets(updatedTeam) });
});

// Legacy key/direct unlock fallback (maps to purchase)
app.post('/api/problems/unlock', (req, res) => {
  const { teamName, key, memberId, bidAmount } = req.body;
  if (!teamName || !key) {
    return res.status(400).json({ error: 'Team name and unlock key are required.' });
  }

  const problem = db.findProblemByKey(key);
  if (!problem) {
    db.addTelemetry(teamName, memberId || 'UNKNOWN', 'INVALID_KEY_ATTEMPT', `Attempted invalid key: ${String(key).slice(0, 30)}`);
    broadcastToProctors({ type: 'TEAM_UPDATED', team: db.getTeam(teamName) });
    return res.status(400).json({ error: 'Invalid problem key or ID.' });
  }

  try {
    const { team, txn } = db.purchaseProblem(teamName, memberId, problem.id, bidAmount);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team, transaction: txn });
    broadcastToProctors({ type: 'TEAM_UPDATED', team });
    broadcastToProctors({ type: 'TRANSACTION_LOGGED', transaction: txn });

    res.json({
      success: true,
      unlockedId: problem.id,
      title: problem.title,
      costDeducted: txn.price,
      balance: team.balance,
      unlocked: team.unlocked
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// --- ADMIN / ORGANIZER PRICING CONFIGURATION ---
// (These routes sit behind requireAdmin — the admin session token is the authority.)
app.post('/api/admin/problems/price', (req, res) => {
  const { problemId, price } = req.body;
  if (!problemId) {
    return res.status(400).json({ error: 'Problem ID is required' });
  }

  const setPrice = db.setProblemPrice(problemId, price);
  db.addAudit('ADMIN', 'SET_PROBLEM_PRICE', 'PROBLEM', problemId, `bid price=${setPrice}`);

  // Broadcast price change to ALL connected contestants and proctors in real time
  broadcastToAll({
    type: 'PRICE_UPDATED',
    problemId,
    price: setPrice
  });

  res.json({ success: true, problemId, price: setPrice });
});

app.post('/api/admin/problems/batch-prices', (req, res) => {
  const { easyPrice, mediumPrice, hardPrice } = req.body;

  const allPrices = db.batchSetTierPrices(easyPrice, mediumPrice, hardPrice);
  db.addAudit('ADMIN', 'BATCH_SET_PRICES', 'PROBLEMS', 'all', `easy=${easyPrice} medium=${mediumPrice} hard=${hardPrice}`);

  broadcastToAll({
    type: 'PRICES_UPDATED',
    prices: allPrices
  });

  res.json({ success: true, prices: allPrices });
});

app.get('/api/admin/problems/prices', (req, res) => {
  res.json({ prices: db.getAllPrices() });
});

// --- POWER CARDS API: 💡 HINT PASS & ⚡ SABOTAGE CARD (40 ByteCoins) ---
app.post('/api/cards/hint/purchase', (req, res) => {
  const { teamName, memberId, problemId } = req.body;
  try {
    const result = db.purchaseHintPass(teamName, memberId, problemId);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.team });
    if (result.txn) broadcastToProctors({ type: 'TRANSACTION_LOGGED', transaction: result.txn });
    res.json({ success: true, team: stripSecrets(result.team), hint: result.hint, txn: result.txn });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/cards/hint/use', (req, res) => {
  const { teamName, memberId, problemId } = req.body;
  try {
    const result = db.useHintPass(teamName, memberId, problemId);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.team });
    if (result.txn) broadcastToProctors({ type: 'TRANSACTION_LOGGED', transaction: result.txn });
    res.json({ success: true, team: stripSecrets(result.team), hint: result.hint, alreadyRevealed: result.alreadyRevealed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/cards/sabotage/purchase', (req, res) => {
  const { teamName, memberId } = req.body;
  try {
    const result = db.purchaseSabotageCard(teamName, memberId);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.team });
    if (result.txn) broadcastToProctors({ type: 'TRANSACTION_LOGGED', transaction: result.txn });
    res.json({ success: true, team: stripSecrets(result.team), txn: result.txn });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/cards/sabotage/use', (req, res) => {
  const { teamName, memberId, targetTeamName } = req.body;
  try {
    const result = db.useSabotageCard(teamName, memberId, targetTeamName);
    // Real-time WebSocket: freeze the target team immediately!
    broadcastToTeam(result.targetTeam.name, {
      type: 'TEAM_SABOTAGED',
      team: result.targetTeam,
      frozenUntil: result.frozenUntil,
      frozenBy: teamName
    });
    // Update attacking team workspace
    broadcastToTeam(teamName, {
      type: 'TEAM_WORKSPACE_UPDATED',
      team: result.attackingTeam
    });
    // Update proctors
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.targetTeam });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.attackingTeam });
    if (result.txn) broadcastToProctors({ type: 'TRANSACTION_LOGGED', transaction: result.txn });

    res.json({
      success: true,
      attackingTeam: stripSecrets(result.attackingTeam),
      targetTeam: result.targetTeam.name,
      frozenUntil: result.frozenUntil
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/cards/targets', (req, res) => {
  const excludeTeam = req.query.excludeTeam || '';
  const targets = db.getSabotageTargets(excludeTeam);
  res.json({ targets });
});

// Password-protected Power Card Unlock
app.post('/api/cards/unlock', (req, res) => {
  const { teamName, memberId, cardType, password } = req.body;
  if (!teamName || !cardType || !password) {
    return res.status(400).json({ error: 'Team name, card type, and password are required.' });
  }

  try {
    const result = db.unlockCard(teamName, memberId, cardType, password);
    broadcastToTeam(teamName, {
      type: 'TEAM_WORKSPACE_UPDATED',
      team: result.team
    });
    broadcastToProctors({
      type: 'TEAM_UPDATED',
      team: result.team
    });
    res.json({ success: true, team: stripSecrets(result.team), cardType: result.cardType });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- TEAM REGISTRATION & SESSION MANAGEMENT ---
app.post('/api/team/register', (req, res) => {
  const { name, size, captainIdx, members } = req.body;
  try {
    const team = db.registerTeam({ name, size, captainIdx, members });
    broadcastToProctors({ type: 'TEAM_REGISTERED', team });
    res.json({ success: true, team: stripSecrets(team) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/team/login', (req, res) => {
  const { teamName, memberId, password, force } = req.body;
  if (!teamName || !teamName.trim()) {
    return res.status(400).json({ error: 'Team name cannot be blank.' });
  }

  try {
    const { team, member } = db.loginOrInitTeam(teamName, memberId, password, Boolean(force));
    broadcastToProctors({ type: 'TEAM_UPDATED', team });
    // Never ship the login code back to participants
    const { password: _pw, ...safeTeam } = team;
    res.json({ team: enrichTeamForClient(safeTeam), member, eventSettings: db.getEventSettings(), serverTime: Date.now() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/team/:name', (req, res) => {
  const team = db.getTeam(req.params.name);
  if (!team) return res.status(404).json({ error: `Team "${req.params.name}" not found in registration database.` });
  db.isTeamFrozen(team.name);
  const { password: _pw, activeSession: _sess, ...safe } = team;
  res.json({
    team: {
      ...safe,
      hasActiveSession: Boolean(team.activeSession),
      isFrozen: db.isTeamFrozen(team.name),
      effects: db.getTeamActiveEffects(team.name).effects,
      armedDefenses: db.getTeamActiveEffects(team.name).armed,
      inventory: db.getTeamInventory(team.name),
      members: (team.members || []).map(m => ({
        memberId: m.memberId,
        name: m.name,
        isCaptain: Boolean(m.isCaptain),
        rollNo: m.rollNo,
        email: m.email,
        college: m.college
      }))
    },
    eventSettings: db.getEventSettings(),
    serverTime: Date.now()
  });
});

// Public event clock (for countdowns on both sites)
app.get('/api/event', (req, res) => {
  res.json(db.getEventSettings());
});

// Participant PIN unlock: unlocks the problem for this team only (rate-limited).
// problemId is optional — the PIN itself identifies the problem.
app.post('/api/problems/pin-unlock', (req, res) => {
  const { teamName, memberId, problemId, pin } = req.body;
  if (!teamName || !pin) {
    return res.status(400).json({ error: 'Team name and PIN are required.' });
  }
  try {
    const result = db.pinUnlock({ teamName, memberId, problemId, pin });
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TRANSACTION_LOGGED', transaction: result.txn });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json({ success: true, team: stripSecrets(result.team), txn: result.txn, problem: { id: result.problem.id, title: result.problem.title } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Participant fetches a hidden test previously revealed by the Peek wild card
app.post('/api/problems/peek', (req, res) => {
  const { teamName, problemId } = req.body;
  const team = db.getTeam(teamName);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  const peeked = team.peekedTests?.[problemId];
  if (!peeked) return res.status(403).json({ error: 'No peeked test available for this problem. The Peek wild card must be played by the admin first.' });
  res.json({ problemId, peek: peeked });
});

// Participant consumes the AI Debug wild card on one problem (returns analysis hints)
app.post('/api/cards/ai-debug/use', (req, res) => {
  const { teamName, memberId, problemId } = req.body;
  const team = db.getTeam(teamName);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  const grant = team.aiDebug?.[problemId];
  if (!grant) return res.status(403).json({ error: 'No AI Debug granted on this problem.' });
  if (grant.used) return res.status(400).json({ error: 'AI Debug is one-time use and has already been used on this problem.' });

  grant.used = true;
  grant.usedAt = Date.now();
  grant.usedBy = memberId || 'UNKNOWN';

  const problem = db.getFullProblem(problemId) || db.findProblemByKey(problemId);
  const hint = problem ? db.getPredefinedHintFor(problem) : 'Re-read the constraints and trace your logic on the sample input by hand.';
  const analysis = [
    `AI DEBUG ANALYSIS — ${problem ? problem.id : problemId} ${problem ? problem.title : ''}`.trim(),
    '',
    '1. Re-read the constraints: are your loop bounds and data types within limits?',
    '2. Trace your algorithm by hand on the sample input — compare every intermediate value.',
    '3. Check edge cases: empty input, single element, maximum size, negative numbers.',
    hint ? `4. Strategy hint: ${hint}` : '4. Verify your input parsing order matches the input format exactly.'
  ].join('\n');

  db.updateTeam(team);
  db.save();
  broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team });
  res.json({ success: true, analysis, problemId });
});

app.post('/api/teams/sync', (req, res) => {
  try {
    const { teams, rows, csv } = req.body;
    let teamsList = [];
    if (Array.isArray(teams)) {
      teamsList = teams;
    } else if (Array.isArray(rows)) {
      teamsList = parseSheetRows(rows);
    } else if (typeof csv === 'string') {
      teamsList = parseCsvToTeams(csv);
    }

    if (!teamsList.length) {
      return res.status(400).json({ error: 'No valid team records found in sync payload.' });
    }

    const result = db.syncTeams(teamsList);
    broadcastToProctors({ type: 'TEAMS_SYNCED', count: result.count });
    res.json({ success: true, count: result.count });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function parseSheetRows(rows) {
  return rows.map(r => {
    const teamName = r['Team Name'] || r['teamName'] || r['Team'] || r['team'] || '';
    if (!teamName) return null;
    const members = [];
    const m1Name = r['Member 1 Name'] || r['Leader Name'] || r['Captain Name'] || r['member1'] || r['leader'] || r['captain'] || '';
    if (m1Name) members.push({ name: m1Name, isCaptain: true, rollNo: r['Member 1 Roll No'] || '', email: r['Member 1 Email'] || '' });
    const m2Name = r['Member 2 Name'] || r['member2'] || '';
    if (m2Name) members.push({ name: m2Name, isCaptain: false, rollNo: r['Member 2 Roll No'] || '', email: r['Member 2 Email'] || '' });
    const m3Name = r['Member 3 Name'] || r['member3'] || '';
    if (m3Name) members.push({ name: m3Name, isCaptain: false, rollNo: r['Member 3 Roll No'] || '', email: r['Member 3 Email'] || '' });
    return { name: teamName, size: members.length, members };
  }).filter(Boolean);
}

function parseCsvToTeams(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] || ''; });
    rows.push(obj);
  }
  return parseSheetRows(rows);
}

app.get('/api/teams', (req, res) => {
  const teams = db.getAllTeams().map(t => ({
    name: t.name,
    size: t.size,
    members: t.members,
    captainId: t.captainId,
    captainName: t.captainName
  }));
  res.json({ teams });
});

// --- TELEMETRY & ANTI-CHEAT API ---
app.post('/api/telemetry', (req, res) => {
  const { teamName, memberId, event, details } = req.body;
  if (!teamName || !event) {
    return res.status(400).json({ error: 'Missing teamName or event' });
  }

  const { entry, team } = db.addTelemetry(teamName, memberId, event, details);

  // Real-time broadcast to proctors and team members
  broadcastToProctors({
    type: 'TELEMETRY_EVENT',
    entry,
    team
  });

  if (team && team.isLocked) {
    broadcastToTeam(teamName, {
      type: 'TEAM_LOCKED',
      team
    });
  }

  res.json({
    success: true,
    isLocked: team?.isLocked || false,
    violationsCount: team?.violations?.length || 0,
    lockReason: team?.lockReason || ''
  });
});

// --- SUBMISSIONS & RUNNER QUEUE ---
app.post('/api/submissions/run', (req, res) => {
  const { teamName, memberId, lang, code, stdin } = req.body;
  if (!lang || !code) {
    return res.status(400).json({ error: 'Language and code are required.' });
  }

  const team = db.getTeam(teamName);
  if (team && team.isLocked) {
    return res.status(403).json({ error: 'Session is currently locked due to integrity flags.' });
  }
  if (team && db.isTeamFrozen(team.name)) {
    const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
    return res.status(403).json({ error: `⚡ Your team is currently SABOTAGED and frozen! Code execution is locked for another ${remainingSec}s.` });
  }

  const jobId = executionQueue.enqueue({
    type: 'run',
    teamName,
    memberId: memberId || 'UNKNOWN',
    problemId: null,
    lang,
    code,
    stdin: stdin || ''
  });

  res.json({ jobId, status: 'QUEUED' });
});

app.post('/api/submissions/submit', (req, res) => {
  const { teamName, memberId, problemId, lang, code } = req.body;
  if (!teamName || !problemId || !lang || !code) {
    return res.status(400).json({ error: 'Missing submission parameters.' });
  }

  const team = db.getTeam(teamName);
  if (team && team.isLocked) {
    return res.status(403).json({ error: 'Session is locked by proctors.' });
  }
  if (team && db.isTeamFrozen(team.name)) {
    const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
    return res.status(403).json({ error: `⚡ Your team is currently SABOTAGED and frozen! Submissions are locked for another ${remainingSec}s.` });
  }
  // Language Lock wild card: the target must submit in the locked language
  if (team?.languageLock?.active && team.languageLock.lang && team.languageLock.lang !== lang) {
    return res.status(403).json({
      error: `🔡 LANGUAGE LOCK: your team must solve its next problem in ${String(team.languageLock.lang).toUpperCase()} (locked by ${team.languageLock.lockedBy || 'a rival team'}). The lock clears after your next accepted solution.`
    });
  }

  const jobId = executionQueue.enqueue({
    type: 'submit',
    teamName,
    memberId: memberId || 'UNKNOWN',
    problemId,
    lang,
    code
  });

  // When job completes, broadcast update to team workspace and proctors
  executionQueue.subscribe(jobId, (job) => {
    if (job.status === 'COMPLETED') {
      const updatedTeam = db.getTeam(teamName);
      if (updatedTeam) {
        broadcastToTeam(teamName, {
          type: 'TEAM_WORKSPACE_UPDATED',
          team: updatedTeam
        });
        broadcastToProctors({
          type: 'TEAM_UPDATED',
          team: updatedTeam
        });
        if (job.submission) {
          broadcastToProctors({
            type: 'SUBMISSION_RECORDED',
            submission: job.submission
          });
        }
        broadcastToAll({
          type: 'LEADERBOARD_UPDATED'
        });
      }
    }
  });

  res.json({ jobId, status: 'QUEUED' });
});

app.get('/api/submissions/status/:id', (req, res) => {
  const job = executionQueue.getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    id: job.id,
    type: job.type,
    status: job.status,
    result: job.result,
    submission: job.submission || null,
    error: job.error,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  });
});

app.get('/api/submissions', (req, res) => {
  const { teamName } = req.query;
  const submissions = teamName ? db.getTeamSubmissions(teamName) : db.getAllSubmissions();
  res.json({ submissions });
});

app.get('/api/submissions/team/:name', (req, res) => {
  res.json({ submissions: db.getTeamSubmissions(req.params.name) });
});

// --- PROCTOR & ADMIN APIS ---
// Note: /api/proctor/unlock stays PIN-based (organiser emergency unlock entered
// on a participant's screen). Everything else here requires the admin session.
app.get('/api/proctor/teams', requireAdmin, (req, res) => {
  const teams = db.getAllTeams();
  res.json({
    teams,
    totalTeams: teams.length,
    activeTeams: teams.filter(t => !t.isLocked).length,
    lockedTeams: teams.filter(t => t.isLocked).length
  });
});

app.post('/api/proctor/unlock', (req, res) => {
  const { teamName, pin } = req.body;
  const result = db.unlockTeam(teamName, pin || db.state.config.adminPin);
  if (result.success) {
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.team });
    return res.json({ success: true, team: stripSecrets(result.team) });
  }
  res.status(400).json({ error: result.message });
});

app.post('/api/proctor/reset', requireAdmin, (req, res) => {
  const { teamName } = req.body;
  const result = db.resetTeamProgress(teamName);
  if (result.success) {
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToProctors({ type: 'TEAM_UPDATED', team: result.team });
    return res.json({ success: true, team: result.team });
  }
  res.status(400).json({ error: result.message });
});

app.post('/api/proctor/reset-all', (req, res) => {
  const { pin } = req.body;
  if (pin !== db.state.config.adminPin) {
    return res.status(403).json({ error: 'Invalid Organiser PIN' });
  }
  db.resetAllData();
  broadcastToAll({ type: 'RESET_ALL' });
  res.json({ success: true, message: 'All teams, submissions, and telemetry reset.' });
});

// --- LEADERBOARD ---
app.get('/api/leaderboard', (req, res) => {
  const settings = db.getEventSettings();
  if (settings.leaderboardFrozen) {
    const snap = db.state.eventSettings?.leaderboardSnapshot;
    return res.json({
      leaderboard: snap?.rows || [],
      frozen: true,
      frozenAt: snap?.at || null,
      eventSettings: settings
    });
  }
  res.json({ leaderboard: db.computeLeaderboard(), frozen: false, eventSettings: settings });
});


// --- DEDICATED ADMIN DASHBOARD APIS (all guarded by requireAdmin above) ---

// --- WILD CARD MODULE ---
app.get('/api/admin/wildcards', (req, res) => {
  res.json({
    cards: db.getWildCards(),
    activeEffects: db.getActiveEffectRecords(),
    activationLog: db.getActivationLog(150),
    eventSettings: db.getEventSettings()
  });
});

// Record an OFFLINE wild card bid: deducts coins, grants the single copy
app.post('/api/admin/wildcards/bid', (req, res) => {
  const { cardId, teamName, coins } = req.body;
  try {
    const result = db.bidWildCard({ cardId, teamName, coins, adminId: 'ADMIN' });
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    broadcastToAll({ type: 'PRICES_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Activate an owned card (attack cards take a target; problem-scoped cards take a problem)
app.post('/api/admin/wildcards/activate', (req, res) => {
  const { cardId, teamName, targetTeam, problemId, targetProblemId, lang, amount } = req.body;
  try {
    const result = db.activateWildCard({ cardId, teamName, targetTeamName: targetTeam, problemId, targetProblemId, lang, amount, adminId: 'ADMIN' });
    // Real-time updates to everyone involved
    const targets = new Set([teamName]);
    if (result.targetTeam?.name) targets.add(result.targetTeam.name);
    if (targetTeam) targets.add(targetTeam);
    for (const t of targets) {
      const team = db.getTeam(t);
      if (team) {
        broadcastToTeam(t, { type: 'TEAM_WORKSPACE_UPDATED', team });
        if (result.activation.cardId === 'FREEZE' && t === result.activation.targetTeam) {
          broadcastToTeam(t, { type: 'TEAM_SABOTAGED', team, frozenUntil: team.frozenUntil, frozenBy: result.activation.byTeam });
        }
      }
    }
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Arm a defensive card (Shield / Mirror / Insurance) — declared BEFORE an attack
app.post('/api/admin/wildcards/arm', (req, res) => {
  const { cardId, teamName } = req.body;
  try {
    const result = db.armDefenseCard({ cardId, teamName, adminId: 'ADMIN' });
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: db.getTeam(teamName) });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel an active effect (logged)
app.post('/api/admin/wildcards/cancel', (req, res) => {
  const { activationId } = req.body;
  try {
    const act = db.cancelActivation(activationId, 'ADMIN');
    if (act.targetTeam) {
      const team = db.getTeam(act.targetTeam);
      if (team) broadcastToTeam(act.targetTeam, { type: 'TEAM_WORKSPACE_UPDATED', team });
    }
    if (act.byTeam) {
      const team = db.getTeam(act.byTeam);
      if (team) broadcastToTeam(act.byTeam, { type: 'TEAM_WORKSPACE_UPDATED', team });
    }
    res.json({ success: true, activation: act });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Enable / disable an individual wild card
app.post('/api/admin/wildcards/toggle', (req, res) => {
  const { cardId, enabled } = req.body;
  try {
    const card = db.toggleWildCard(cardId, enabled, 'ADMIN');
    res.json({ success: true, card });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- EVENT CLOCK & LEADERBOARD CONTROL ---
app.get('/api/admin/event', (req, res) => {
  res.json(db.getEventSettings());
});

app.post('/api/admin/event', (req, res) => {
  const { startAt, endAt } = req.body;
  const settings = db.setEventClock({ startAt, endAt }, 'ADMIN');
  broadcastToAll({ type: 'EVENT_UPDATED', eventSettings: settings });
  res.json({ success: true, eventSettings: settings });
});

app.post('/api/admin/event/wildcard-override', (req, res) => {
  const { override, reason } = req.body;
  const settings = db.overrideWildCardsClosed(Boolean(override), 'ADMIN', reason || '');
  broadcastToAll({ type: 'EVENT_UPDATED', eventSettings: settings });
  res.json({ success: true, eventSettings: settings });
});

app.post('/api/admin/event/freeze-leaderboard', (req, res) => {
  const { frozen } = req.body;
  const settings = frozen ? db.freezeLeaderboard('ADMIN') : db.unfreezeLeaderboard('ADMIN');
  broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
  res.json({ success: true, eventSettings: settings });
});

// --- UNLOCK PIN MANAGEMENT ---
app.get('/api/admin/pins', (req, res) => {
  res.json({ pins: db.getPins() });
});

app.post('/api/admin/pins/generate', (req, res) => {
  const { force } = req.body;
  try {
    const result = db.generatePins(Boolean(force), 'ADMIN');
    res.json({ success: true, generated: result.generated.length, pins: result.pins });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/pins/release', (req, res) => {
  const { problemId, teamName } = req.body;
  try {
    const result = db.releasePin(problemId, teamName, 'ADMIN');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/pins/regenerate', (req, res) => {
  const { problemId } = req.body;
  try {
    const record = db.regeneratePin(problemId, 'ADMIN');
    res.json({ success: true, problemId, record });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- MANUAL OVERRIDES & TRANSACTION CORRECTIONS ---
app.post('/api/admin/adjust-coins', (req, res) => {
  const { teamName, amount, reason } = req.body;
  try {
    const result = db.adminAdjustCoins({ teamName, amount, reason, adminId: 'ADMIN' });
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/adjust-score', (req, res) => {
  const { teamName, delta, reason } = req.body;
  try {
    const result = db.adminAdjustScore({ teamName, delta, reason, adminId: 'ADMIN' });
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/transactions/undo', (req, res) => {
  const { txnId } = req.body;
  try {
    const result = db.undoTransaction(txnId, 'ADMIN');
    broadcastToTeam(result.team.name, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/admin/audit', (req, res) => {
  res.json({ auditLog: db.getAuditLog() });
});

// Custom points per problem
app.post('/api/admin/problems/points', (req, res) => {
  const { problemId, points } = req.body;
  if (!problemId) return res.status(400).json({ error: 'Problem ID is required.' });
  const p = Number(points);
  if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Points must be a non-negative number.' });
  if (!db.state.problemPoints) db.state.problemPoints = {};
  if (p === 0) {
    delete db.state.problemPoints[problemId];
  } else {
    db.state.problemPoints[problemId] = p;
  }
  db.addAudit('ADMIN', 'SET_PROBLEM_POINTS', 'PROBLEM', problemId, `points=${p || '(reset to difficulty default)'}`);
  db.save();
  broadcastToAll({ type: 'PRICES_UPDATED' });
  res.json({ success: true, problemId, points: db.getProblemPoints(problemId) });
});

// CSV exports for faculty coordinators
function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

app.get('/api/admin/export/submissions.csv', (req, res) => {
  const rows = db.getAllSubmissions().map(s => ({
    id: s.id,
    team: s.teamName || s.teamId,
    member: s.memberName || s.memberId,
    problem: s.problemId,
    problemTitle: s.problemTitle,
    verdict: s.verdict,
    passed: s.passed,
    hiddenTestsPassed: s.testResults ? `${s.testResults.passed}/${s.testResults.total}` : '',
    penalty: s.penalty,
    awardedPoints: s.awardedPoints,
    language: s.lang || '',
    time: s.isoTime,
    details: (s.details || '').replace(/\n/g, ' '),
    code: (s.code || '').replace(/\n/g, '\\n')
  }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows));
});

app.get('/api/admin/export/transactions.csv', (req, res) => {
  const rows = db.getAllTransactions().map(t => ({
    id: t.id,
    type: t.type || 'PROBLEM_BID',
    team: t.teamName,
    item: t.item || t.problemTitle || t.problemId || '',
    amount: t.bidAmount ?? t.price ?? t.cost ?? 0,
    balanceAfter: t.remainingBalance,
    undone: t.undone ? 'YES' : '',
    recordedBy: t.recordedBy || t.purchasedByName || '',
    time: t.timestamp ? (typeof t.timestamp === 'number' ? new Date(t.timestamp).toISOString() : t.timestamp) : ''
  }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows));
});

app.get('/api/admin/export/teams.csv', (req, res) => {
  const rows = db.getAllTeams().map(t => ({
    team: t.name,
    captain: t.captainName,
    members: (t.members || []).map(m => `${m.name}${m.rollNo ? ` (${m.rollNo})` : ''}`).join(' | '),
    size: t.size,
    balance: t.balance ?? 1000,
    score: t.score || 0,
    solved: (t.solved || []).length,
    wrong: t.wrong || 0,
    wildCards: db.getTeamInventory(t.name).map(c => c.name).join(' | '),
    locked: t.isLocked ? 'YES' : ''
  }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="teams-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows));
});

// Admin Problem Unlock
app.post('/api/admin/problems/unlock', (req, res) => {
  const { teamName, problemId, bidPrice } = req.body;
  try {
    const result = db.adminUnlockProblem(teamName, problemId, bidPrice);
    if (result.teams) {
      result.teams.forEach(t => {
        broadcastToTeam(t.name, { type: 'TEAM_WORKSPACE_UPDATED', team: t });
      });
    }
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Problem Lock
app.post('/api/admin/problems/lock', (req, res) => {
  const { teamName, problemId } = req.body;
  try {
    const result = db.adminLockProblem(teamName, problemId);
    if (result.teams) {
      result.teams.forEach(t => {
        broadcastToTeam(t.name, { type: 'TEAM_WORKSPACE_UPDATED', team: t });
      });
    }
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Card Unlock (Hint or Sabotage)
app.post('/api/admin/cards/unlock', (req, res) => {
  const { teamName, cardType } = req.body;
  try {
    const result = db.adminUnlockCard(teamName, cardType);
    if (result.teams) {
      result.teams.forEach(t => {
        broadcastToTeam(t.name, { type: 'TEAM_WORKSPACE_UPDATED', team: t });
      });
    }
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Card Lock (Hint or Sabotage)
app.post('/api/admin/cards/lock', (req, res) => {
  const { teamName, cardType } = req.body;
  try {
    const result = db.adminLockCard(teamName, cardType);
    if (result.teams) {
      result.teams.forEach(t => {
        broadcastToTeam(t.name, { type: 'TEAM_WORKSPACE_UPDATED', team: t });
      });
    }
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Grant Card Pass / Inventory
app.post('/api/admin/cards/grant', (req, res) => {
  const { teamName, cardType, amount } = req.body;
  try {
    const result = db.adminGrantCardPass(teamName, cardType, amount || 1);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Reveal Problem Hint
app.post('/api/admin/hints/reveal', (req, res) => {
  const { teamName, problemId } = req.body;
  try {
    const result = db.adminRevealProblemHint(teamName, problemId);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Clear Sabotage Freeze
app.post('/api/admin/sabotage/unfreeze', (req, res) => {
  const { teamName } = req.body;
  try {
    const result = db.adminClearFreeze(teamName);
    broadcastToTeam(teamName, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- CSV PARSING UTILITIES ---
function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else if (c === '\t' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i]);
    if (values.length === 0 || values.every(v => !v.trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] || '').trim().replace(/^["']|["']$/g, '');
    });
    rows.push(obj);
  }
  return rows;
}

// --- GOOGLE SHEET & CSV USER/TEAM IMPORT API ---
app.post('/api/admin/import-sheet', async (req, res) => {
  const { sheetUrl, csvText, rows: directRows, usersPerTeam = 2, teamPrefix = 'TEAM' } = req.body;
  let rawCsv = (csvText || '').trim();

  try {
    let rows = [];

    if (directRows && Array.isArray(directRows) && directRows.length > 0) {
      rows = directRows;
    } else {
      if (sheetUrl && sheetUrl.trim()) {
        let fetchUrl = sheetUrl.trim();
        const matchDoc = fetchUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (matchDoc) {
          const id = matchDoc[1];
          let gid = '0';
          const gidMatch = fetchUrl.match(/[#&?]gid=([0-9]+)/);
          if (gidMatch) gid = gidMatch[1];
          fetchUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
        } else if (fetchUrl.includes('/pubhtml')) {
          fetchUrl = fetchUrl.replace('/pubhtml', '/pub?output=csv');
        }

        console.log('Fetching Google Sheet from:', fetchUrl);
        const resp = await fetch(fetchUrl);
        if (!resp.ok) {
          throw new Error(`Failed to fetch Google Sheet (${resp.status} ${resp.statusText}). Make sure sheet sharing is set to "Anyone with the link can view".`);
        }
        rawCsv = await resp.text();
      }

      if (!rawCsv) {
        return res.status(400).json({ error: 'No Google Sheet URL, CSV text, or contestant rows provided.' });
      }

      rows = parseCSV(rawCsv);
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No contestant rows found in the sheet.' });
    }

    const teamsToCreate = parseSheetRowsToTeams(rows, usersPerTeam, teamPrefix);
    if (teamsToCreate.length === 0) {
      return res.status(400).json({ error: 'Could not generate teams. Ensure the sheet has a Name column.' });
    }

    const createdTeams = [];
    for (const t of teamsToCreate) {
      const saved = db.upsertTeam(t);
      createdTeams.push(saved);
      if (isSupabaseReady()) {
        syncTeamToSupabase(saved).catch(err => console.error('Supabase sync error:', err));
      }
    }

    // Broadcast updates in real time
    broadcastToProctors({
      type: 'INIT_PROCTOR',
      teams: db.getAllTeams(),
      prices: db.getAllPrices(),
      transactions: db.getAllTransactions().slice(0, 50),
      telemetry: db.state.telemetry.slice(0, 50)
    });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });

    res.json({
      success: true,
      message: `Successfully created ${createdTeams.length} teams with ${rows.length} contestants (1-3 members per team)!`,
      teamsCount: createdTeams.length,
      contestantsCount: rows.length,
      teams: createdTeams
    });
  } catch (err) {
    console.error('Import sheet error:', err);
    res.status(400).json({ error: err.message || 'Failed to process sheet' });
  }
});

// Admin Team Roster API
app.get('/api/admin/teams', (req, res) => {
  const teams = db.getAllTeams();
  res.json({ teams });
});

// Admin Create Individual Team (issues a 6-character login code)
app.post('/api/admin/teams/create', async (req, res) => {
  const { name, members } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Team name is required.' });
  }
  if (!members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'At least one team member is required (up to 3).' });
  }

  const cleanName = name.trim();
  if (db.getTeam(cleanName)) {
    return res.status(400).json({ error: `Team "${cleanName}" is already registered. Use Edit to change its roster, or pick another name.` });
  }
  const teamId = cleanName.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
  const teamMembers = members.slice(0, 3).map((m, idx) => ({
    memberId: `${teamId}-M0${idx + 1}`,
    name: m.name || `Member ${idx + 1}`,
    isCaptain: idx === 0,
    rollNo: m.rollNo || '',
    phone: m.phone || '',
    email: m.email || '',
    college: m.college || ''
  }));

  const newTeam = {
    id: teamId,
    name: cleanName,
    size: teamMembers.length,
    password: db.generateTeamPassword(),
    activeSession: null,
    captainId: teamMembers[0]?.memberId || '',
    captainName: teamMembers[0]?.name || '',
    members: teamMembers,
    balance: 1000,
    unlocked: [],
    solved: [],
    problemStatuses: {},
    revealedHints: {},
    hintPassesCount: 0,
    sabotageCardsCount: 0,
    transactions: [],
    score: 0,
    wrong: 0,
    violations: [],
    isLocked: false,
    lockReason: '',
    attempts: [],
    createdAt: new Date().toISOString()
  };

  const saved = db.upsertTeam(newTeam);
  if (isSupabaseReady()) {
    syncTeamToSupabase(saved).catch(err => console.error('Supabase sync error:', err));
  }

  broadcastToProctors({ type: 'TEAM_UPDATED', team: saved });
  broadcastToAll({ type: 'LEADERBOARD_UPDATED' });

  res.json({ success: true, team: saved });
});

// Admin Delete Team
app.delete('/api/admin/teams/:teamName', (req, res) => {
  const teamName = req.params.teamName;
  const deleted = db.deleteTeam(teamName);
  if (deleted) {
    broadcastToProctors({
      type: 'INIT_PROCTOR',
      teams: db.getAllTeams(),
      prices: db.getAllPrices(),
      transactions: db.getAllTransactions().slice(0, 50),
      telemetry: db.state.telemetry.slice(0, 50)
    });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    return res.json({ success: true, message: `Team ${teamName} deleted.` });
  }
  res.status(404).json({ error: 'Team not found.' });
});

// Admin Edit Team (1-3 members, captain)
app.put('/api/admin/teams/:teamName', (req, res) => {
  try {
    const result = db.editTeam(req.params.teamName, req.body, 'ADMIN');
    broadcastToTeam(result.team.name, { type: 'TEAM_WORKSPACE_UPDATED', team: result.team });
    broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
    res.json({ success: true, team: result.team });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: view / regenerate a team's login code
app.get('/api/admin/teams/:teamName/password', (req, res) => {
  const team = db.getTeam(req.params.teamName);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  db.ensureTeamPassword(team);
  db.save();
  res.json({ teamName: team.name, password: team.password });
});

app.post('/api/admin/teams/:teamName/password', (req, res) => {
  try {
    const result = db.regenerateTeamPassword(req.params.teamName, 'ADMIN');
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: release a team's active session (one-session enforcement)
app.post('/api/admin/teams/:teamName/clear-session', (req, res) => {
  try {
    const result = db.clearTeamSession(req.params.teamName, 'ADMIN');
    res.json({ success: true, team: result.team.name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin Problem CRUD: title, description, constraints, difficulty, custom
// points, sample I/O, extra/hidden tests, optional hint text per problem.
app.post('/api/admin/problems/create', (req, res) => {
  try {
    const prob = db.createProblem(req.body, 'ADMIN');
    broadcastToAll({ type: 'PRICES_UPDATED' });
    res.json({ success: true, problem: prob });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/problems/:problemId', (req, res) => {
  try {
    const prob = db.updateProblem(req.params.problemId, req.body, 'ADMIN');
    broadcastToAll({ type: 'PRICES_UPDATED' });
    res.json({ success: true, problem: prob });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/problems/:problemId', (req, res) => {
  try {
    const result = db.deleteProblem(req.params.problemId, 'ADMIN');
    broadcastToAll({ type: 'PRICES_UPDATED' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Leaderboard reset (scores/penalties/solves cleared; coins & unlocks kept)
app.post('/api/admin/event/reset-leaderboard', (req, res) => {
  if (!req.body || req.body.confirm !== true) {
    return res.status(400).json({ error: 'Reset requires { confirm: true }.' });
  }
  const settings = db.resetLeaderboardScores('ADMIN');
  broadcastToAll({ type: 'LEADERBOARD_UPDATED' });
  broadcastToAll({ type: 'EVENT_UPDATED', eventSettings: settings });
  res.json({ success: true, eventSettings: settings });
});

// Supabase Status & Manual Sync
app.get('/api/admin/supabase/status', (req, res) => {
  res.json({
    configured: isSupabaseReady(),
    status: isSupabaseReady() ? 'CONNECTED' : 'LOCAL_STORAGE_ONLY'
  });
});

app.post('/api/admin/supabase/sync', async (req, res) => {
  if (!isSupabaseReady()) {
    return res.status(400).json({ error: 'Supabase is not configured in .env' });
  }

  const allTeams = db.getAllTeams();
  let synced = 0;
  for (const t of allTeams) {
    const r = await syncTeamToSupabase(t);
    if (r.success) synced++;
  }

  res.json({
    success: true,
    message: `Synced ${synced}/${allTeams.length} teams to Supabase.`
  });
});

// Admin Full Overview
app.get('/api/admin/overview', (req, res) => {
  const teams = db.getAllTeams();
  const problems = db.getPublicProblems();
  res.json({
    teams,
    problems,
    transactions: db.getAllTransactions(),
    unlockHistory: db.getUnlockHistory(),
    submissions: db.getAllSubmissions().slice(0, 100),
    wildCards: db.getWildCards(),
    activeEffects: db.getActiveEffectRecords(),
    activationLog: db.getActivationLog(100),
    eventSettings: db.getEventSettings(),
    pins: db.getPins(),
    auditLog: db.getAuditLog()
  });
});

// SPA Fallback
if (fs.existsSync(FRONTEND_DIST)) {
  // Normalize trailing slashes (e.g. /admin/ -> /admin) so the built relative
  // asset URLs keep resolving from the site root
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.path.length > 1 && req.path.endsWith('/')) {
      return res.redirect(301, req.path.slice(0, -1) + req.url.slice(req.path.length));
    }
    next();
  });
  app.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Qubit AntiCheat Server running on port ${PORT}`);
});
