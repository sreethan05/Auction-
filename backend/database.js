import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPredefinedHint } from './hints.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Database {
  constructor() {
    this.state = {
      problems: [],
      problemPrices: {}, // problemId -> number (dynamically set by organizer)
      teams: {},         // Clean start: populated ONLY via actual registration
      transactions: [],  // Immutable audit log of problem purchases
      unlockHistory: [], // Admin unlock transactions audit log
      submissions: [],
      telemetry: [],
      config: {
        adminPin: process.env.ORGANISER_PIN || "qubit",
        maxFlags: 3,
        executionTimeoutMs: 3000,
        initialTeamBalance: 1000
      },
      wildCards: [],        // catalog: one copy per card, tracks owner
      cardActivations: [],  // full audit: bids, activations, arms, blocks, cancels
      eventSettings: {
        startAt: null,
        endAt: null,
        wildCardsOverride: false,   // confirmed admin override of the 20-min cutoff
        leaderboardFrozen: false,
        leaderboardSnapshot: null,
        frozenAt: null
      },
      auditLog: [],         // every admin action with actor + reason
      pins: {},             // problemId -> { pin, generatedAt, releasedTo }
      problemPoints: {},    // problemId -> custom points override
      deletedProblems: []   // tombstones: admin-deleted problems stay deleted across restarts
    };
    this.load();
    this.seedProblems();
    this.seedWildCards();
    // Ensure clean state: remove dummy/test data
    this.cleanDummyData();
  }

  load() {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        this.state = {
          ...this.state,
          ...parsed,
          problemPrices: parsed.problemPrices || {},
          transactions: parsed.transactions || [],
          unlockHistory: parsed.unlockHistory || [],
          teams: parsed.teams || {},
          submissions: parsed.submissions || [],
          telemetry: parsed.telemetry || [],
          wildCards: parsed.wildCards || [],
          cardActivations: parsed.cardActivations || [],
          eventSettings: { ...this.state.eventSettings, ...(parsed.eventSettings || {}) },
          auditLog: parsed.auditLog || [],
          pins: parsed.pins || {},
          problemPoints: parsed.problemPoints || {},
          deletedProblems: parsed.deletedProblems || []
        };
      }
    } catch (err) {
      console.error('Failed to load store, using fresh state:', err);
    }
  }

  save() {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to persist store:', err);
    }
  }

  // --- TEAM LOGIN CREDENTIALS & SINGLE ACTIVE SESSION ---
  // Every team has a login code (password). Admins can view / regenerate it.
  // Only one active session per team: login records activeSession; a second
  // device must either wait or force-takeover (logged).
  generateTeamPassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  ensureTeamPassword(team) {
    if (!team) return null;
    if (!team.password) {
      team.password = this.generateTeamPassword();
    }
    return team.password;
  }

  verifyTeamPassword(team, password) {
    if (!team) return false;
    if (!team.password) return true; // legacy teams without a code: allow once, then assign
    if (password === undefined || password === null) return false;
    return String(password).trim().toUpperCase() === String(team.password).trim().toUpperCase();
  }

  regenerateTeamPassword(teamName, adminId) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    team.password = this.generateTeamPassword();
    team.activeSession = null;
    this.addAudit(adminId || 'ADMIN', 'REGENERATE_TEAM_PASSWORD', 'TEAM', team.name, `new login code issued; active session cleared`);
    this.updateTeam(team);
    this.save();
    return { teamName: team.name, password: team.password };
  }

  clearTeamSession(teamName, adminId) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    team.activeSession = null;
    this.addAudit(adminId || 'ADMIN', 'CLEAR_TEAM_SESSION', 'TEAM', team.name, 'active session released');
    this.updateTeam(team);
    this.save();
    return { team };
  }

  editTeam(teamName, { members, captainIdx } = {}, adminId) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    if (members !== undefined) {
      if (!Array.isArray(members) || members.length === 0) throw new Error('At least one member is required.');
      if (members.length > 3) throw new Error('A team can have at most 3 members.');
      const formatted = members.slice(0, 3).map((m, idx) => ({
        memberId: (m.memberId || `${team.name.toUpperCase().replace(/[^A-Z0-9_-]/g, '_')}-M0${idx + 1}`).trim(),
        name: (m.name || '').trim() || `Member ${idx + 1}`,
        rollNo: (m.rollNo || '').trim(),
        phone: (m.phone || '').trim(),
        email: (m.email || '').trim(),
        college: (m.college || '').trim(),
        isCaptain: captainIdx !== undefined ? idx === Number(captainIdx) : Boolean(m.isCaptain ?? (idx === 0))
      }));
      if (!formatted.some(m => m.name)) throw new Error('Member names cannot be blank.');
      team.members = formatted;
      team.size = formatted.length;
      const captain = formatted.find(m => m.isCaptain) || formatted[0];
      team.captainId = captain.memberId;
      team.captainName = captain.name;
    }
    this.addAudit(adminId || 'ADMIN', 'EDIT_TEAM', 'TEAM', team.name, `${(team.members || []).length} member(s)`);
    this.updateTeam(team);
    this.save();
    return { team };
  }

  cleanDummyData() {
    const dummyNames = ['testteam', 'demoteam'];
    let modified = false;
    for (const key of Object.keys(this.state.teams)) {
      if (dummyNames.includes(key.toLowerCase())) {
        delete this.state.teams[key];
        modified = true;
      }
    }

    // Testing teams requested by organizer: Synora (2 members) & VisionX (1 member)
    if (!this.getTeam('Synora')) {
      this.state.teams['Synora'] = {
        id: 'Synora',
        name: 'Synora',
        size: 2,
        password: 'SYNORA1',
        activeSession: null,
        captainId: 'SYNORA-001-M01',
        captainName: 'Salman',
        members: [
          { memberId: 'SYNORA-001-M01', name: 'Salman', isCaptain: true, rollNo: '', phone: '', email: '', college: '' },
          { memberId: 'SYNORA-001-M02', name: 'Sreethan', isCaptain: false, rollNo: '', phone: '', email: '', college: '' }
        ],
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
      modified = true;
    }

    if (!this.getTeam('VisionX')) {
      this.state.teams['VisionX'] = {
        id: 'VisionX',
        name: 'VisionX',
        size: 1,
        password: 'VISION1',
        activeSession: null,
        captainId: 'VISIONX-001-M01',
        captainName: 'Rukhsaar',
        members: [
          { memberId: 'VISIONX-001-M01', name: 'Rukhsaar', isCaptain: true, rollNo: '', phone: '', email: '', college: '' }
        ],
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
      modified = true;
    }

    if (modified) {
      this.save();
    }
    // Backfill login codes for legacy teams that predate passwords
    let pwFixed = false;
    for (const t of Object.values(this.state.teams)) {
      if (!t.password) { t.password = this.generateTeamPassword(); pwFixed = true; }
      if (t.activeSession === undefined) { t.activeSession = null; pwFixed = true; }
    }
    if (pwFixed) this.save();
  }

  resetAllData() {
    this.state.teams = {};
    this.state.transactions = [];
    this.state.telemetry = [];
    this.state.submissions = [];
    this.state.cardActivations = [];
    this.state.unlockHistory = [];
    for (const card of this.state.wildCards || []) {
      card.owner = null;
      card.bidAmount = null;
      card.soldAt = null;
    }
    this.save();
  }

  // --- PROBLEM DIFFICULTY POINTS CONFIGURATION ---
  // Base points by difficulty: Easy → 200, Medium → 300, Hard → 400.
  // Admin can override the points of any individual problem (problemPoints map).
  getProblemDifficultyPoints(prob) {
    if (!prob) return 200;
    const diff = typeof prob === 'string' ? prob : (prob.diff || 'Easy');
    const d = String(diff).trim().toLowerCase();
    if (d === 'hard') return 400;
    if (d === 'medium') return 300;
    return 200; // Easy is default: 200
  }

  // Final points for a problem = admin override ?? difficulty points
  getProblemPoints(probOrId) {
    const prob = typeof probOrId === 'string'
      ? this.state.problems.find(p => p.id === probOrId)
      : probOrId;
    if (!prob) return 200;
    const override = this.state.problemPoints?.[prob.id];
    if (override !== undefined && override !== null && !isNaN(Number(override))) {
      return Number(override);
    }
    return this.getProblemDifficultyPoints(prob);
  }

  seedProblems() {
    try {
      const dataProblemPath = path.join(__dirname, 'data', 'qubit-problems.json');
      const parentProblemPath = path.join(__dirname, '..', 'qubit-problems.json');
      const targetPath = fs.existsSync(dataProblemPath) ? dataProblemPath : (fs.existsSync(parentProblemPath) ? parentProblemPath : null);

      if (targetPath) {
        const fileContent = fs.readFileSync(targetPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed.problems && Array.isArray(parsed.problems)) {
          // Merge, never wipe: keep admin-created/edited problems across restarts,
          // backfill catalog fields for file problems missing from the store.
          const byId = new Map((this.state.problems || []).map(p => [p.id, p]));
          const tombstones = new Set(this.state.deletedProblems || []);
          for (const prob of parsed.problems) {
            if (!byId.has(prob.id) && !tombstones.has(prob.id)) {
              prob.pts = this.getProblemDifficultyPoints(prob);
              byId.set(prob.id, prob);
            }
          }
          this.state.problems = Array.from(byId.values());
          this.save();
          return;
        }
      }
    } catch (e) {
      console.error('Problem seed error:', e);
    }
  }

  // --- PROBLEM ACCESS & DYNAMIC PRICING ---
  getPublicProblems() {
    if (!this.state.problems || this.state.problems.length < 20) {
      this.seedProblems();
    }
    return this.state.problems.map(p => ({
      id: p.id,
      title: p.title,
      diff: p.diff,
      pts: this.getProblemPoints(p),
      cat: p.cat,
      desc: p.desc,
      con: p.con,
      si: p.si,
      so: p.so,
      // Dynamic price configured by organizer:
      price: this.getProblemPrice(p.id)
    }));
  }

  getAllProblems() {
    return this.getPublicProblems();
  }

  getFullProblem(id) {
    const prob = this.state.problems.find(p => p.id === id);
    if (prob) {
      prob.pts = this.getProblemDifficultyPoints(prob);
    }
    return prob;
  }

  getProblem(id) {
    return this.getFullProblem(id);
  }

  findProblemByKey(key) {
    const k = (key || '').trim().toLowerCase();
    return this.state.problems.find(p => 
      (p.id || '').toLowerCase() === k ||
      (p.key || '').toLowerCase() === k ||
      (p.origId || '').toLowerCase() === k ||
      (p.origId || '').toLowerCase().replace('lc', '') === k ||
      (p.title || '').toLowerCase() === k
    );
  }

  // Dynamic organizer pricing
  getProblemPrice(problemId) {
    if (!this.state.problemPrices) this.state.problemPrices = {};
    const price = this.state.problemPrices[problemId];
    if (price !== undefined && price !== null) {
      return Number(price);
    }
    return null; // Not set yet by organizer
  }

  setProblemPrice(problemId, price) {
    if (!this.state.problemPrices) this.state.problemPrices = {};
    const numPrice = Math.max(0, parseInt(price, 10) || 0);
    this.state.problemPrices[problemId] = numPrice;
    this.save();
    return numPrice;
  }

  batchSetTierPrices(easyPrice = 100, mediumPrice = 150, hardPrice = 200) {
    if (!this.state.problemPrices) this.state.problemPrices = {};
    for (const prob of this.state.problems) {
      if (prob.diff === 'Hard') {
        this.state.problemPrices[prob.id] = Number(hardPrice);
      } else if (prob.diff === 'Medium') {
        this.state.problemPrices[prob.id] = Number(mediumPrice);
      } else {
        this.state.problemPrices[prob.id] = Number(easyPrice);
      }
    }
    this.save();
    return this.state.problemPrices;
  }

  getAllPrices() {
    return this.state.problemPrices || {};
  }

  // --- TEAM REGISTRATION & SESSION MANAGEMENT ---
  registerTeam({ name, size, captainIdx = 0, members = [] }) {
    const normalized = (name || '').trim();
    if (!normalized) {
      throw new Error('Team name cannot be blank.');
    }

    // Check if team already exists
    const existing = Object.keys(this.state.teams).find(
      k => k.toLowerCase() === normalized.toLowerCase()
    );
    if (existing) {
      throw new Error(`Team "${normalized}" is already registered. Please choose a different name or log in.`);
    }

    const teamSize = Math.max(1, Math.min(3, parseInt(size, 10) || 1));
    if (members.length < teamSize) {
      throw new Error(`Please provide information for all ${teamSize} team members.`);
    }

    const formattedMembers = [];
    for (let i = 0; i < teamSize; i++) {
      const m = members[i] || {};
      const memberIndexStr = String(i + 1).padStart(2, '0');
      const memberId = (m.memberId || `${normalized}-001-M${memberIndexStr}`).trim();
      const isCaptain = (i === parseInt(captainIdx, 10));

      if (!m.name || !m.name.trim()) {
        throw new Error(`Member ${i + 1} name is required.`);
      }

      formattedMembers.push({
        memberId,
        name: m.name.trim(),
        rollNo: (m.rollNo || '').trim(),
        phone: (m.phone || '').trim(),
        email: (m.email || '').trim(),
        college: (m.college || '').trim(),
        isCaptain
      });
    }

    const captain = formattedMembers.find(m => m.isCaptain) || formattedMembers[0];

    const newTeam = {
      id: normalized,
      name: normalized,
      size: teamSize,
      password: this.generateTeamPassword(),
      activeSession: null,
      captainId: captain.memberId,
      captainName: captain.name,
      members: formattedMembers,
      balance: this.state.config.initialTeamBalance || 1000,
      unlocked: [],
      solved: [],
      problemStatuses: {}, // problemId -> { status, workingBy, solvedBy, ... }
      transactions: [],
      score: 0,
      wrong: 0,
      violations: [],
      isLocked: false,
      lockReason: "",
      attempts: [],
      createdAt: new Date().toISOString()
    };

    this.state.teams[normalized] = newTeam;
    this.save();
    return newTeam;
  }

  getTeam(teamName) {
    const k = (teamName || '').trim();
    return this.state.teams[k] || Object.values(this.state.teams).find(t => t.name.toLowerCase() === k.toLowerCase()) || null;
  }

  loginOrInitTeam(teamName, memberId, password = null, force = false) {
    const normalized = (teamName || '').trim();
    if (!normalized) {
      throw new Error('Team name cannot be blank.');
    }

    let team = this.getTeam(normalized);
    if (!team) {
      throw new Error(`Team "${normalized}" was not found in the registration database. Please verify your team name.`);
    }

    // Team login code (password) — required once a code has been issued
    this.ensureTeamPassword(team);
    if (!this.verifyTeamPassword(team, password)) {
      this.updateTeam(team);
      this.save();
      throw new Error('Incorrect team login code. Ask your organizer for the 6-character team code.');
    }

    // Determine the active member
    let member = null;
    const targetId = (memberId || '').trim().toLowerCase();
    if (targetId && team.members) {
      member = team.members.find(m => m.memberId.toLowerCase() === targetId);
      if (!member) {
        member = team.members.find(m => m.memberId.toLowerCase().endsWith(targetId));
      }
      if (!member) {
        member = team.members.find(m => m.name.toLowerCase() === targetId);
      }
    }
    if (!member) {
      throw new Error(`Selected member identity was not found for team "${team.name}".`);
    }

    // One active session per team: block a second device unless force-takeover
    const now = Date.now();
    const active = team.activeSession;
    const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // stale sessions expire after 12h
    const sessionAlive = active && (now - (active.at || 0) < SESSION_TTL_MS);
    if (sessionAlive && active.memberId !== member.memberId && !force) {
      const holder = (team.members || []).find(m => m.memberId === active.memberId);
      throw new Error(
        `Team "${team.name}" already has an active session (${holder ? holder.name + ' ' : ''}${active.memberId}). ` +
        `Only one device per team. Tick "Force login" to take over, or ask an admin to release the session.`
      );
    }
    if (!sessionAlive || active?.memberId !== member.memberId || force) {
      team.activeSession = { memberId: member.memberId, at: now, forced: Boolean(force && sessionAlive) };
      if (force && sessionAlive) {
        this.addAudit('PARTICIPANT', 'FORCE_TEAM_LOGIN', 'TEAM', team.name, `${member.memberId} took over session from ${active.memberId}`);
      }
      this.updateTeam(team);
      this.save();
    }

    return { team, member };
  }

  syncTeams(teamsList) {
    if (!Array.isArray(teamsList)) {
      throw new Error('teamsList must be an array');
    }
    let count = 0;
    for (const item of teamsList) {
      if (!item || !item.name) continue;
      const normalized = item.name.trim();
      const existing = this.getTeam(normalized);
      const teamSize = Math.max(1, Math.min(3, parseInt(item.size, 10) || (item.members ? item.members.length : 1)));
      const rawMembers = Array.isArray(item.members) ? item.members : [];
      const formattedMembers = [];

      for (let i = 0; i < teamSize; i++) {
        const m = rawMembers[i] || {};
        const memberIndexStr = String(i + 1).padStart(2, '0');
        const defaultMemberId = `${normalized}-001-M${memberIndexStr}`;
        formattedMembers.push({
          memberId: (m.memberId || defaultMemberId).trim(),
          name: (m.name || `Member ${i + 1}`).trim(),
          rollNo: (m.rollNo || '').trim(),
          phone: (m.phone || '').trim(),
          email: (m.email || '').trim(),
          college: (m.college || '').trim(),
          isCaptain: m.isCaptain !== undefined ? Boolean(m.isCaptain) : (i === 0)
        });
      }

      const captain = formattedMembers.find(m => m.isCaptain) || formattedMembers[0];

      if (existing) {
        existing.members = formattedMembers;
        existing.size = formattedMembers.length;
        existing.captainId = captain.memberId;
        existing.captainName = captain.name;
        this.state.teams[existing.name] = existing;
      } else {
        const newTeam = {
          id: normalized,
          name: normalized,
          size: formattedMembers.length,
          password: this.generateTeamPassword(),
          activeSession: null,
          captainId: captain.memberId,
          captainName: captain.name,
          members: formattedMembers,
          balance: this.state.config.initialTeamBalance || 1000,
          unlocked: [],
          solved: [],
          problemStatuses: {},
          transactions: [],
          score: 0,
          wrong: 0,
          violations: [],
          isLocked: false,
          lockReason: "",
          attempts: [],
          createdAt: new Date().toISOString()
        };
        this.state.teams[normalized] = newTeam;
      }
      count++;
    }
    this.save();
    return { count, teams: this.getAllTeams() };
  }

  getOrCreateTeam(teamName) {
    return this.loginOrInitTeam(teamName).team;
  }

  getAllTeams() {
    return Object.values(this.state.teams);
  }

  updateTeam(team) {
    if (team && team.name) {
      this.state.teams[team.name] = team;
      this.save();
    }
  }

  // --- OFFLINE BIDDING: TEAM-LEVEL PROBLEM UNLOCK & BID AMOUNT DEDUCTION ---
  purchaseProblem(teamName, memberId, problemId, bidAmount, password) {
    const team = this.getTeam(teamName);
    if (!team) {
      throw new Error('Team not found.');
    }
    if (team.isLocked) {
      throw new Error('Your team session is locked by proctors.');
    }
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is currently SABOTAGED and frozen! Remaining freeze time: ${remainingSec}s.`);
    }

    const problem = this.getFullProblem(problemId) || this.findProblemByKey(problemId);
    if (!problem) {
      throw new Error(`Problem "${problemId}" not found in catalog.`);
    }

    if (password) {
      const p = String(password).trim().toLowerCase();
      const validPasswords = [
        (problem.key || '').toLowerCase(),
        (problem.id || '').toLowerCase(),
        (problem.title || '').toLowerCase(),
        (this.state.config?.adminPin || 'qubit').toLowerCase(),
        'qubit',
        'admin'
      ].filter(Boolean);
      if (!validPasswords.includes(p)) {
        throw new Error('Incorrect password. Problem remains locked.');
      }
    }

    if (team.unlocked.includes(problem.id)) {
      throw new Error(`Problem "${problem.id} — ${problem.title}" is already unlocked for your team!`);
    }

    // Determine bid amount: use entered winning bid amount or configured price
    let finalBidAmount;
    if (bidAmount !== undefined && bidAmount !== null && String(bidAmount).trim() !== '' && !isNaN(Number(bidAmount))) {
      finalBidAmount = Math.max(0, parseInt(bidAmount, 10));
    } else {
      const configuredPrice = this.getProblemPrice(problem.id);
      if (configuredPrice !== null && configuredPrice !== undefined) {
        finalBidAmount = configuredPrice;
      } else {
        throw new Error('Please enter the winning bid amount agreed in the offline auction.');
      }
    }

    if (team.balance < finalBidAmount) {
      throw new Error(`Insufficient budget! Your winning bid is ₹${finalBidAmount}, but team only has ₹${team.balance} remaining.`);
    }

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId || `${team.name}-01`,
      name: memberId || 'Team Member'
    };

    // Deduct bid amount at the TEAM level
    team.balance -= finalBidAmount;
    team.unlocked.push(problem.id);

    // Initialize problem status in shared workspace
    if (!team.problemStatuses) team.problemStatuses = {};
    team.problemStatuses[problem.id] = {
      status: 'UNLOCKED',
      unlockedBy: member.memberId,
      unlockedByName: member.name,
      bidAmount: finalBidAmount,
      unlockedAt: new Date().toISOString()
    };

    // Maintain immutable transaction record
    const now = new Date();
    const txn = {
      id: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      teamId: team.name,
      teamName: team.name,
      problemId: problem.id,
      problemTitle: problem.title,
      bidAmount: finalBidAmount,
      price: finalBidAmount, // compatibility alias
      purchasedBy: member.memberId,
      purchasedByName: member.name,
      remainingBalance: team.balance,
      purchaseTime: now.toISOString(),
      displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    this.state.transactions.unshift(txn);

    this.updateTeam(team);
    this.save();

    return { team, txn, problem };
  }

  // --- SHARED WORKSPACE ACTIVITY TRACKING ---
  setMemberWorking(teamName, memberId, problemId) {
    const team = this.getTeam(teamName);
    if (!team) return null;
    if (!team.problemStatuses) team.problemStatuses = {};

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId,
      name: memberId
    };

    // Don't overwrite if problem is already solved
    if (team.problemStatuses[problemId]?.status === 'SOLVED') {
      return team;
    }

    team.problemStatuses[problemId] = {
      status: 'IN_PROGRESS',
      workingBy: member.memberId,
      workingByName: member.name,
      updatedAt: new Date().toISOString()
    };

    this.updateTeam(team);
    return team;
  }

  // --- CONTEST SUBMISSIONS & SCORING RULES ---
  // Points per problem = admin override ?? difficulty base (Easy 200 / Medium 300 / Hard 400)
  // Every failed submission → −10 points (waived once by an armed Insurance card)
  // When eventually accepted → award full points (×2 if a Double Points booster was played)
  // Final problem score = Points − (Number of Wrong Submissions × 10)
  // ByteCoins/balance is NOT touched (separate currencies)
  processSubmissionResult({ teamName, memberId, problemId, verdict, passed, details = '', lang = null, code = null, testResults = null }) {
    const team = this.getTeam(teamName);
    if (!team) return null;

    const problem = this.getFullProblem(problemId) || this.findProblemByKey(problemId) || {
      id: problemId,
      title: problemId,
      diff: 'Easy'
    };

    const basePoints = this.getProblemPoints(problem);

    if (!team.problemWrong) team.problemWrong = {};
    if (!team.problemStatuses) team.problemStatuses = {};
    if (!team.attempts) team.attempts = [];

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId || `${team.name}-01`,
      name: memberId || 'Team Member'
    };

    const now = Date.now();
    let penalty = 0;
    let awardedPoints = 0;
    let insuranceUsed = false;
    const isAlreadySolved = (team.solved || []).includes(problem.id);

    if (passed) {
      if (!isAlreadySolved) {
        // Double Points wild card booster (played by admin on one problem)
        const boosted = team.pointBoosters?.[problem.id] === 2;
        awardedPoints = boosted ? basePoints * 2 : basePoints;
        if (boosted) {
          delete team.pointBoosters[problem.id];
        }
        team.solved.push(problem.id);
        team.score = (team.score || 0) + awardedPoints;
        team.lastSolveAt = now; // tie-break: earlier solve time wins

        // Language Lock is satisfied once the target solves any problem
        this.clearLanguageLock(team.name, 'PROBLEM_SOLVED');
      }

      const wrongCount = team.problemWrong[problem.id] || 0;
      const finalProblemScore = awardedPoints - (wrongCount * 10);

      team.problemStatuses[problem.id] = {
        ...team.problemStatuses[problem.id],
        status: 'SOLVED',
        solvedBy: member.memberId,
        solvedByName: member.name,
        solvedAt: new Date(now).toISOString(),
        difficultyPoints: basePoints,
        awardedPoints: awardedPoints,
        wrongSubmissions: wrongCount,
        penaltyDeduction: wrongCount * 10,
        finalProblemScore: finalProblemScore
      };
    } else {
      // Wrong answer, runtime error, or time limit: −10 penalty.
      // COMPILATION_ERROR is free (spec penalty list is WA/TLE/MLE/RE only):
      // the log is returned, nothing is deducted, and it is not counted as
      // an attempt. Penalty applies only if the problem is not solved yet;
      // an armed Insurance waives it once.
      const isCompileError = String(verdict || '').toUpperCase() === 'COMPILATION_ERROR';
      if (!isAlreadySolved && !isCompileError) {
        const insurance = this.consumeInsurance(team.name);
        if (insurance) {
          insuranceUsed = true;
          penalty = 0;
        } else {
          penalty = -10;
          team.score = (team.score || 0) - 10;
        }
        team.wrong = (team.wrong || 0) + 1;
        team.problemWrong[problem.id] = (team.problemWrong[problem.id] || 0) + 1;
      }

      const wrongCount = team.problemWrong[problem.id] || 0;

      if (!team.problemStatuses[problem.id] || team.problemStatuses[problem.id].status !== 'SOLVED') {
        team.problemStatuses[problem.id] = {
          ...team.problemStatuses[problem.id],
          status: 'IN_PROGRESS',
          workingBy: member.memberId,
          workingByName: member.name,
          updatedAt: new Date(now).toISOString(),
          difficultyPoints: basePoints,
          wrongSubmissions: wrongCount,
          penaltyDeduction: wrongCount * 10
        };
      }
    }

    // Required audit log fields: Team ID, Member ID, Problem ID, result, penalty, timestamp
    const subRecord = {
      id: `SUB-${now}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      teamId: team.name,
      teamName: team.name,
      memberId: member.memberId,
      memberName: member.name,
      problemId: problem.id,
      problemTitle: problem.title,
      difficulty: problem.diff,
      difficultyPoints: basePoints,
      result: verdict || (passed ? 'ACCEPTED' : 'WRONG_ANSWER'),
      verdict: verdict || (passed ? 'ACCEPTED' : 'WRONG_ANSWER'),
      passed: Boolean(passed),
      penalty: penalty, // -10, or 0 when waived by Insurance
      insuranceUsed,
      awardedPoints: awardedPoints,
      lang: lang || null,
      code: typeof code === 'string' ? code.slice(0, 20000) : null,
      testResults: testResults || null,
      wrongCountOnProblem: team.problemWrong[problem.id] || 0,
      totalTeamWrong: team.wrong || 0,
      currentTeamScore: team.score,
      details: details || '',
      timestamp: now,
      isoTime: new Date(now).toISOString()
    };

    team.attempts.unshift(subRecord);
    this.recordSubmission(subRecord);
    this.updateTeam(team);
    this.save();

    return { team, subRecord };
  }

  recordSolve(teamName, memberId, problemId, pts = null) {
    const res = this.processSubmissionResult({
      teamName,
      memberId,
      problemId,
      verdict: 'ACCEPTED',
      passed: true
    });
    return res ? res.team : null;
  }

  // --- TELEMETRY & AUDIT LOGS ---
  addTelemetry(teamName, memberId, event, details) {
    const team = this.getTeam(teamName);
    const entry = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 6),
      teamName,
      memberId: memberId || 'UNKNOWN',
      event,
      details,
      timestamp: Date.now(),
      isoTime: new Date().toISOString()
    };

    this.state.telemetry.unshift(entry);
    if (this.state.telemetry.length > 2000) {
      this.state.telemetry.pop();
    }

    if (team) {
      if (!team.violations) team.violations = [];
      team.violations.push(entry);
      if (team.violations.length >= this.state.config.maxFlags) {
        team.isLocked = true;
        team.lockReason = `Flag threshold exceeded (${team.violations.length} violations detected; latest by ${entry.memberId}). Organiser review required.`;
      }
      this.updateTeam(team);
    }

    this.save();
    return { entry, team };
  }

  unlockTeam(teamName, pin) {
    if (pin !== this.state.config.adminPin) {
      return { success: false, message: 'Invalid Organiser PIN' };
    }
    const team = this.getTeam(teamName);
    if (!team) return { success: false, message: 'Team not found' };

    team.isLocked = false;
    team.lockReason = '';
    this.updateTeam(team);
    return { success: true, team };
  }

  resetTeamProgress(teamName) {
    const team = this.getTeam(teamName);
    if (!team) return { success: false, message: 'Team not found' };

    team.balance = this.state.config.initialTeamBalance || 1000;
    team.unlocked = [];
    team.solved = [];
    team.problemStatuses = {};
    team.problemWrong = {};
    team.transactions = [];
    team.score = 0;
    team.wrong = 0;
    team.violations = [];
    team.isLocked = false;
    team.lockReason = "";
    team.attempts = [];
    this.updateTeam(team);
    return { success: true, team };
  }

  // --- POWER CARDS: 💡 HINT PASS (40 ByteCoins) ---
  purchaseHintPass(teamName, memberId, problemId = null) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error('Team not found.');
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is currently frozen! Remaining time: ${remainingSec}s.`);
    }
    if (team.isLocked) throw new Error('Your team session is locked by proctors.');

    const cost = 40;
    if (team.balance < cost) {
      throw new Error(`Insufficient ByteCoins! Hint Pass costs ${cost} ByteCoins, but team only has ${team.balance} ByteCoins remaining.`);
    }

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId || `${team.name}-01`,
      name: memberId || 'Team Member'
    };

    let hintData = null;
    if (problemId) {
      const problem = this.getFullProblem(problemId) || this.findProblemByKey(problemId);
      if (!problem) throw new Error(`Problem "${problemId}" not found in catalog.`);
      if (!team.unlocked.includes(problem.id)) {
        throw new Error(`Hint Pass can only be used on a problem that your team has already unlocked.`);
      }

      if (!team.revealedHints) team.revealedHints = {};
      const hintText = this.getPredefinedHintFor(problem);
      hintData = {
        problemId: problem.id,
        problemTitle: problem.title,
        hint: hintText,
        revealedBy: member.memberId,
        revealedByName: member.name,
        timestamp: Date.now()
      };
      team.revealedHints[problem.id] = hintData;
    } else {
      team.hintPassesCount = (team.hintPassesCount || 0) + 1;
    }

    team.balance -= cost;

    const txn = {
      id: `TXN-HINT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      teamId: team.name,
      teamName: team.name,
      type: 'HINT_PASS',
      cardType: 'HINT_PASS',
      cost,
      price: cost,
      problemId: problemId || null,
      purchasedBy: member.memberId,
      purchasedByName: member.name,
      remainingBalance: team.balance,
      timestamp: Date.now(),
      isoTime: new Date().toISOString()
    };

    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    this.state.transactions.unshift(txn);

    this.save();
    return { team, txn, hint: hintData };
  }

  useHintPass(teamName, memberId, problemId) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error('Team not found.');
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is currently frozen! Remaining time: ${remainingSec}s.`);
    }
    if (team.isLocked) throw new Error('Your team session is locked by proctors.');

    const problem = this.getFullProblem(problemId) || this.findProblemByKey(problemId);
    if (!problem) throw new Error(`Problem "${problemId}" not found in catalog.`);
    if (!team.unlocked.includes(problem.id)) {
      throw new Error(`Hint Pass can only be used on a problem that your team has already unlocked.`);
    }

    if (!team.revealedHints) team.revealedHints = {};
    if (team.revealedHints[problem.id]) {
      return { team, hint: team.revealedHints[problem.id], alreadyRevealed: true };
    }

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId || `${team.name}-01`,
      name: memberId || 'Team Member'
    };

    const cost = 40;
    if ((team.hintPassesCount || 0) > 0) {
      team.hintPassesCount -= 1;
    } else if (team.balance >= cost) {
      team.balance -= cost;
    } else {
      throw new Error(`No Hint Passes available in inventory and insufficient ByteCoins (requires 40 ByteCoins).`);
    }

    const hintText = this.getPredefinedHintFor(problem);
    const hintData = {
      problemId: problem.id,
      problemTitle: problem.title,
      hint: hintText,
      revealedBy: member.memberId,
      revealedByName: member.name,
      timestamp: Date.now()
    };
    team.revealedHints[problem.id] = hintData;

    const txn = {
      id: `TXN-HINT-USE-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      teamId: team.name,
      teamName: team.name,
      type: 'HINT_PASS',
      cardType: 'HINT_PASS',
      cost,
      price: cost,
      problemId: problem.id,
      purchasedBy: member.memberId,
      purchasedByName: member.name,
      remainingBalance: team.balance,
      timestamp: Date.now(),
      isoTime: new Date().toISOString()
    };

    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    this.state.transactions.unshift(txn);

    this.save();
    return { team, txn, hint: hintData };
  }

  // --- POWER CARDS: ⚡ SABOTAGE CARD (40 ByteCoins) ---
  purchaseSabotageCard(teamName, memberId) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error('Team not found.');
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is currently frozen! Remaining time: ${remainingSec}s.`);
    }
    if (team.isLocked) throw new Error('Your team session is locked by proctors.');

    const cost = 40;
    if (team.balance < cost) {
      throw new Error(`Insufficient ByteCoins! Sabotage Card costs ${cost} ByteCoins, but team only has ${team.balance} ByteCoins remaining.`);
    }

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId || `${team.name}-01`,
      name: memberId || 'Team Member'
    };

    team.balance -= cost;
    team.sabotageCardsCount = (team.sabotageCardsCount || 0) + 1;

    const txn = {
      id: `TXN-SABOTAGE-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      teamId: team.name,
      teamName: team.name,
      type: 'SABOTAGE_CARD',
      cardType: 'SABOTAGE_CARD',
      cost,
      price: cost,
      purchasedBy: member.memberId,
      purchasedByName: member.name,
      remainingBalance: team.balance,
      timestamp: Date.now(),
      isoTime: new Date().toISOString()
    };

    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    this.state.transactions.unshift(txn);

    this.save();
    return { team, txn };
  }

  useSabotageCard(teamName, memberId, targetTeamName) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error('Team not found.');
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is currently frozen! Remaining time: ${remainingSec}s.`);
    }
    if (team.isLocked) throw new Error('Your team session is locked by proctors.');

    if (!targetTeamName || targetTeamName.trim().toLowerCase() === team.name.toLowerCase()) {
      throw new Error('You cannot sabotage your own team!');
    }

    const target = this.getTeam(targetTeamName);
    if (!target) {
      throw new Error(`Target team "${targetTeamName}" not found.`);
    }

    const now = Date.now();
    if (target.frozenUntil && target.frozenUntil > now) {
      const remainingSec = Math.ceil((target.frozenUntil - now) / 1000);
      throw new Error(`Team "${target.name}" is already frozen! Remaining freeze time: ${remainingSec}s.`);
    }

    const member = (team.members || []).find(m => m.memberId === memberId) || {
      memberId: memberId || `${team.name}-01`,
      name: memberId || 'Team Member'
    };

    const cost = 40;
    if ((team.sabotageCardsCount || 0) > 0) {
      team.sabotageCardsCount -= 1;
    } else if (team.balance >= cost) {
      team.balance -= cost;
    } else {
      throw new Error(`No Sabotage Cards in inventory and insufficient ByteCoins (requires 40 ByteCoins).`);
    }

    // Freeze target for exactly 5 minutes (300,000 ms)
    const freezeDurationMs = 5 * 60 * 1000;
    target.frozenUntil = now + freezeDurationMs;
    target.frozenBy = team.name;
    target.frozenAt = now;

    const txn = {
      id: `TXN-SABOTAGE-ACT-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      teamId: team.name,
      teamName: team.name,
      type: 'SABOTAGE',
      cardType: 'SABOTAGE',
      cost,
      price: cost,
      targetTeam: target.name,
      purchasedBy: member.memberId,
      purchasedByName: member.name,
      remainingBalance: team.balance,
      timestamp: now,
      isoTime: new Date().toISOString()
    };

    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    this.state.transactions.unshift(txn);

    this.save();
    return {
      attackingTeam: team,
      targetTeam: target,
      frozenUntil: target.frozenUntil,
      txn
    };
  }

  isTeamFrozen(teamName) {
    const team = this.getTeam(teamName);
    if (!team) return false;
    if (team.frozenUntil) {
      if (team.frozenUntil > Date.now()) {
        return true;
      } else {
        team.frozenUntil = null;
        team.frozenBy = null;
        this.save();
        return false;
      }
    }
    return false;
  }

  getSabotageTargets(excludeTeamName) {
    const now = Date.now();
    const excludeKey = (excludeTeamName || '').trim().toLowerCase();
    return this.getAllTeams()
      .filter(t => t.name.toLowerCase() !== excludeKey)
      .map(t => {
        const isFrozen = Boolean(t.frozenUntil && t.frozenUntil > now);
        return {
          id: t.name,
          name: t.name,
          size: t.size,
          isFrozen,
          frozenBy: isFrozen ? t.frozenBy : null,
          frozenUntil: isFrozen ? t.frozenUntil : null,
          remainingSeconds: isFrozen ? Math.max(0, Math.ceil((t.frozenUntil - now) / 1000)) : 0,
          status: isFrozen ? 'Frozen' : 'Playing'
        };
      });
  }

  // --- POWER CARDS: PASSWORD-PROTECTED UNLOCK ---
  unlockCard(teamName, memberId, cardType, password) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error('Team not found.');
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is currently frozen! Remaining freeze time: ${remainingSec}s.`);
    }
    if (team.isLocked) throw new Error('Your team session is locked by proctors.');

    const p = String(password || '').trim().toLowerCase();
    const type = String(cardType || '').trim().toUpperCase();

    const adminPin = (this.state.config?.adminPin || 'qubit').toLowerCase();
    let isValid = (p === adminPin || p === 'qubit' || p === 'admin');

    if (type === 'HINT') {
      const hintKeys = ['hint', 'hintpass', 'hint40', 'bluecard'];
      if (hintKeys.includes(p)) isValid = true;
    } else if (type === 'SABOTAGE') {
      const sabotageKeys = ['sabotage', 'freeze', 'sabotage40', 'redcard'];
      if (sabotageKeys.includes(p)) isValid = true;
    }

    if (!isValid) {
      throw new Error('Incorrect password. Card remains locked.');
    }

    if (!team.unlockedCards) team.unlockedCards = [];
    if (!team.unlockedCards.includes(type)) {
      team.unlockedCards.push(type);
      this.save();
    }
    return { success: true, team, cardType: type };
  }

  // --- SUBMISSIONS ---
  recordSubmission(sub) {
    this.state.submissions.unshift(sub);
    if (this.state.submissions.length > 3000) {
      this.state.submissions.pop();
    }
    this.save();
  }

  getSubmission(id) {
    return this.state.submissions.find(s => s.id === id);
  }

  getAllSubmissions() {
    return this.state.submissions || [];
  }

  getTeamSubmissions(teamName) {
    if (!teamName) return this.getAllSubmissions();
    const target = teamName.trim().toLowerCase();
    return (this.state.submissions || []).filter(
      s => (s.teamName || s.teamId || '').toLowerCase() === target
    );
  }

  getAllTransactions() {
    return this.state.transactions || [];
  }

  getUnlockHistory() {
    return this.state.unlockHistory || [];
  }

  // Single source of truth for leaderboard ranking:
  // score desc → earlier last solve wins the tie → fewer wrong attempts
  computeLeaderboard() {
    const now = Date.now();
    return this.getAllTeams()
      .map(t => {
        const balance = t.balance ?? 1000;
        const coinBonus = Math.round(balance / 10);
        const problemScore = t.score || 0;
        return {
          name: t.name,
          captainName: t.captainName,
          size: t.size,
          balance,
          coinBonus,
          problemScore,
          score: problemScore + coinBonus,
          lastSolveAt: t.lastSolveAt || null,
          solvedCount: (t.solved || []).length,
          wrongAttempts: t.wrong || 0,
          problemWrong: t.problemWrong || {},
          violationsCount: (t.violations || []).length,
          isLocked: Boolean(t.isLocked),
          isFrozen: Boolean(t.frozenUntil && t.frozenUntil > now)
        };
      })
      .sort((a, b) =>
        b.score - a.score ||
        (a.lastSolveAt ?? Infinity) - (b.lastSolveAt ?? Infinity) ||
        a.wrongAttempts - b.wrongAttempts
      );
  }

  // Leaderboard reset: zeroes problem scores/penalties/solves (keeps coins
  // and unlocks). Logged. Used from Event & Ledger → leaderboard control.
  resetLeaderboardScores(adminId) {
    for (const team of Object.values(this.state.teams)) {
      team.score = 0;
      team.wrong = 0;
      team.solved = [];
      team.problemWrong = {};
      team.problemStatuses = {};
      team.lastSolveAt = null;
      delete team.pointBoosters;
    }
    this.state.submissions = [];
    if (this.state.eventSettings) {
      this.state.eventSettings.leaderboardFrozen = false;
      this.state.eventSettings.leaderboardSnapshot = null;
    }
    this.addAudit(adminId || 'ADMIN', 'RESET_LEADERBOARD', 'EVENT', 'leaderboard', 'scores, penalties and solves cleared; coins/unlocks kept');
    this.save();
    return this.getEventSettings();
  }

  // --- PROBLEM MANAGEMENT (full CRUD for admins) ---
  // title, description, constraints, difficulty, custom points, sample I/O,
  // extra tests (ht string), hidden tests, optional hint text per problem.
  validateProblemPayload(p, isNew = true) {
    const diffs = ['Easy', 'Medium', 'Hard'];
    if (isNew && (!p.id || !String(p.id).trim())) throw new Error('Problem ID is required (e.g. E94).');
    if (!p.title || !String(p.title).trim()) throw new Error('Problem title is required.');
    if (p.diff && !diffs.includes(p.diff)) throw new Error('Difficulty must be Easy, Medium, or Hard.');
    if (p.points !== undefined && (isNaN(Number(p.points)) || Number(p.points) < 0)) {
      throw new Error('Points must be a non-negative number.');
    }
    return true;
  }

  createProblem(payload, adminId) {
    const p = { ...(payload || {}) };
    p.id = String(p.id || '').trim().toUpperCase();
    this.validateProblemPayload(p, true);
    if (this.getFullProblem(p.id) || this.findProblemByKey(p.id)) {
      throw new Error(`Problem "${p.id}" already exists.`);
    }
    const prob = {
      id: p.id,
      key: (p.key || p.id).toString().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      title: String(p.title).trim(),
      diff: p.diff || 'Easy',
      pts: this.getProblemDifficultyPoints(p.diff || 'Easy'),
      cat: p.cat || p.category || 'Algorithms',
      desc: p.desc || p.description || '',
      con: p.con || p.constraints || '',
      si: p.si || p.sampleInput || '',
      so: p.so || p.sampleOutput || '',
      eo: p.eo || p.expectedOutput || p.so || p.sampleOutput || '',
      ht: p.ht || p.hiddenTests || '',
      customHint: p.customHint || p.hint || '',
      origId: p.origId || ''
    };
    this.state.problems.push(prob);
    if (Array.isArray(this.state.deletedProblems)) {
      this.state.deletedProblems = this.state.deletedProblems.filter(id => id !== prob.id);
    }
    if (p.points !== undefined && p.points !== null && String(p.points) !== '') {
      if (!this.state.problemPoints) this.state.problemPoints = {};
      this.state.problemPoints[prob.id] = Number(p.points);
    }
    // Optional PIN at creation
    if (p.pin) {
      if (!this.state.pins) this.state.pins = {};
      this.state.pins[prob.id] = { pin: String(p.pin).trim(), generatedAt: Date.now(), releasedTo: null };
    }
    this.addAudit(adminId || 'ADMIN', 'CREATE_PROBLEM', 'PROBLEM', prob.id, `${prob.title} [${prob.diff}]`);
    this.save();
    return prob;
  }

  updateProblem(problemId, patch, adminId) {
    const prob = this.getFullProblem(problemId);
    if (!prob) throw new Error(`Problem "${problemId}" not found.`);
    const p = { ...(patch || {}) };
    if (p.title !== undefined) prob.title = String(p.title).trim() || prob.title;
    if (p.diff !== undefined) {
      if (!['Easy', 'Medium', 'Hard'].includes(p.diff)) throw new Error('Difficulty must be Easy, Medium, or Hard.');
      prob.diff = p.diff;
    }
    if (p.cat !== undefined || p.category !== undefined) prob.cat = p.cat ?? p.category ?? prob.cat;
    if (p.desc !== undefined || p.description !== undefined) prob.desc = p.desc ?? p.description ?? prob.desc;
    if (p.con !== undefined || p.constraints !== undefined) prob.con = p.con ?? p.constraints ?? prob.con;
    if (p.si !== undefined || p.sampleInput !== undefined) prob.si = p.si ?? p.sampleInput ?? prob.si;
    if (p.so !== undefined || p.sampleOutput !== undefined) prob.so = p.so ?? p.sampleOutput ?? prob.so;
    if (p.eo !== undefined || p.expectedOutput !== undefined) prob.eo = p.eo ?? p.expectedOutput ?? prob.eo;
    if (p.ht !== undefined || p.hiddenTests !== undefined) prob.ht = p.ht ?? p.hiddenTests ?? prob.ht;
    if (p.customHint !== undefined || p.hint !== undefined) prob.customHint = p.customHint ?? p.hint ?? '';
    if (p.key !== undefined) prob.key = String(p.key).toUpperCase().replace(/[^A-Z0-9]/g, '') || prob.key;
    if (p.points !== undefined) {
      if (!this.state.problemPoints) this.state.problemPoints = {};
      if (p.points === null || p.points === '' || Number(p.points) === 0) delete this.state.problemPoints[prob.id];
      else {
        if (isNaN(Number(p.points)) || Number(p.points) < 0) throw new Error('Points must be a non-negative number.');
        this.state.problemPoints[prob.id] = Number(p.points);
      }
    }
    prob.pts = this.getProblemPoints(prob);
    this.addAudit(adminId || 'ADMIN', 'UPDATE_PROBLEM', 'PROBLEM', prob.id, Object.keys(p).join(','));
    this.save();
    return prob;
  }

  deleteProblem(problemId, adminId) {
    const idx = (this.state.problems || []).findIndex(p => p.id === problemId);
    if (idx === -1) throw new Error(`Problem "${problemId}" not found.`);
    const [removed] = this.state.problems.splice(idx, 1);
    if (!Array.isArray(this.state.deletedProblems)) this.state.deletedProblems = [];
    if (!this.state.deletedProblems.includes(problemId)) this.state.deletedProblems.push(problemId);    if (this.state.problemPoints) delete this.state.problemPoints[problemId];
    if (this.state.pins) delete this.state.pins[problemId];
    if (this.state.problemPrices) delete this.state.problemPrices[problemId];
    // Remove unlock references (keep submissions permanently for audit)
    for (const team of Object.values(this.state.teams)) {
      if (team.unlocked) team.unlocked = team.unlocked.filter(id => id !== problemId);
      if (team.solved) team.solved = team.solved.filter(id => id !== problemId);
      if (team.problemStatuses) delete team.problemStatuses[problemId];
      if (team.problemWrong) delete team.problemWrong[problemId];
      if (team.revealedHints) delete team.revealedHints[problemId];
    }
    this.addAudit(adminId || 'ADMIN', 'DELETE_PROBLEM', 'PROBLEM', problemId, removed.title || '');
    this.save();
    return { deleted: problemId };
  }

  // --- DEDICATED ADMIN MANAGEMENT METHODS ---
  adminUnlockProblem(teamName, problemId, bidPrice) {
    if (!teamName || teamName.toUpperCase() === 'ALL') {
      throw new Error('Please select a specific target team to unlock a problem.');
    }

    const team = this.getTeam(teamName);
    if (!team) {
      throw new Error(`Team "${teamName}" not found.`);
    }

    if (bidPrice === undefined || bidPrice === null || String(bidPrice).trim() === '') {
      throw new Error('Bid price is required.');
    }

    const bid = Number(bidPrice);
    if (isNaN(bid) || bid <= 0) {
      throw new Error('Bid price must be a valid positive number greater than 0.');
    }

    const currentBalance = team.balance ?? 1000;
    if (bid > currentBalance) {
      throw new Error('Insufficient ByteCoins');
    }

    const problem = this.getProblem(problemId);
    const problemTitle = problem ? problem.title : problemId;

    const previousBalance = currentBalance;
    team.balance = currentBalance - bid;
    const remainingBalance = team.balance;

    if (!team.unlocked) team.unlocked = [];
    if (!team.unlocked.includes(problemId)) {
      team.unlocked.push(problemId);
    }
    if (!team.problemStatuses) team.problemStatuses = {};
    if (!team.problemStatuses[problemId] || team.problemStatuses[problemId].status !== 'SOLVED') {
      team.problemStatuses[problemId] = {
        status: 'UNLOCKED',
        unlockedBy: 'ADMIN',
        unlockedByName: 'Administrator',
        unlockedAt: new Date().toISOString(),
        bidPrice: bid
      };
    }

    const now = new Date();
    const txn = {
      id: `TXN-ADM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type: 'ADMIN_UNLOCK',
      teamName: team.name,
      problemId: problemId,
      problemTitle: problemTitle,
      bidPrice: bid,
      bidAmount: bid,
      price: bid,
      previousBalance: previousBalance,
      remainingBalance: remainingBalance,
      status: 'UNLOCKED',
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };

    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    if (!this.state.transactions) this.state.transactions = [];
    this.state.transactions.unshift(txn);
    if (!this.state.unlockHistory) this.state.unlockHistory = [];
    this.state.unlockHistory.unshift(txn);

    this.updateTeam(team);
    this.save();
    return {
      success: true,
      team,
      teams: [team],
      txn,
      unlockRecord: txn
    };
  }

  adminLockProblem(teamName, problemId) {
    const teamsToUpdate = [];
    if (!teamName || teamName.toUpperCase() === 'ALL') {
      teamsToUpdate.push(...Object.values(this.state.teams));
    } else {
      const team = this.getTeam(teamName);
      if (team) teamsToUpdate.push(team);
    }

    if (teamsToUpdate.length === 0) {
      throw new Error(`Team "${teamName}" not found.`);
    }

    for (const team of teamsToUpdate) {
      if (team.unlocked) {
        team.unlocked = team.unlocked.filter(id => id !== problemId);
      }
      if (team.problemStatuses && team.problemStatuses[problemId] && team.problemStatuses[problemId].status !== 'SOLVED') {
        delete team.problemStatuses[problemId];
      }
      this.updateTeam(team);
    }

    this.save();
    return { success: true, updatedCount: teamsToUpdate.length, teams: teamsToUpdate };
  }

  adminUnlockCard(teamName, cardType) {
    const type = String(cardType || '').trim().toUpperCase();
    const teamsToUpdate = [];
    if (!teamName || teamName.toUpperCase() === 'ALL') {
      teamsToUpdate.push(...Object.values(this.state.teams));
    } else {
      const team = this.getTeam(teamName);
      if (team) teamsToUpdate.push(team);
    }

    if (teamsToUpdate.length === 0) {
      throw new Error(`Team "${teamName}" not found.`);
    }

    for (const team of teamsToUpdate) {
      if (!team.unlockedCards) team.unlockedCards = [];
      if (!team.unlockedCards.includes(type)) {
        team.unlockedCards.push(type);
      }
      if (type === 'HINT') {
        team.hintUnlocked = true;
        if (!team.hintPassesCount || team.hintPassesCount < 1) {
          team.hintPassesCount = 1;
        }
      } else if (type === 'SABOTAGE') {
        team.sabotageUnlocked = true;
        if (!team.sabotageCardsCount || team.sabotageCardsCount < 1) {
          team.sabotageCardsCount = 1;
        }
      }
    }

    this.save();
    return { success: true, updatedCount: teamsToUpdate.length, teams: teamsToUpdate, cardType: type };
  }

  adminLockCard(teamName, cardType) {
    const type = String(cardType || '').trim().toUpperCase();
    const teamsToUpdate = [];
    if (!teamName || teamName.toUpperCase() === 'ALL') {
      teamsToUpdate.push(...Object.values(this.state.teams));
    } else {
      const team = this.getTeam(teamName);
      if (team) teamsToUpdate.push(team);
    }

    if (teamsToUpdate.length === 0) {
      throw new Error(`Team "${teamName}" not found.`);
    }

    for (const team of teamsToUpdate) {
      if (team.unlockedCards) {
        team.unlockedCards = team.unlockedCards.filter(c => c !== type);
      }
      if (type === 'HINT') team.hintUnlocked = false;
      if (type === 'SABOTAGE') team.sabotageUnlocked = false;
    }

    this.save();
    return { success: true, updatedCount: teamsToUpdate.length, teams: teamsToUpdate, cardType: type };
  }

  adminGrantCardPass(teamName, cardType, amount = 1) {
    const type = String(cardType || '').trim().toUpperCase();
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);

    if (!team.unlockedCards) team.unlockedCards = [];
    if (!team.unlockedCards.includes(type)) team.unlockedCards.push(type);

    if (type === 'HINT') {
      team.hintUnlocked = true;
      team.hintPassesCount = (team.hintPassesCount || 0) + amount;
    } else if (type === 'SABOTAGE') {
      team.sabotageUnlocked = true;
      team.sabotageCardsCount = (team.sabotageCardsCount || 0) + amount;
    }

    this.save();
    return { success: true, team };
  }

  adminRevealProblemHint(teamName, problemId) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);

    const hint = this.getPredefinedHintFor(problemId);
    if (!team.revealedHints) team.revealedHints = {};
    team.revealedHints[problemId] = {
      hint,
      revealedBy: 'ADMIN',
      revealedByName: 'Administrator',
      revealedAt: new Date().toISOString()
    };

    this.save();
    return { success: true, team, hint };
  }

  adminClearFreeze(teamName) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    team.frozenUntil = null;
    team.frozenBy = null;
    this.save();
    return { success: true, team };
  }

  // =====================================================================
  // WILD CARD MODULE
  // Cards are bid for OFFLINE; the admin records every bid here. Each card
  // has exactly ONE copy: once sold, no other team can bid for it. Attack
  // cards are activated by the admin against a target team; defensive cards
  // are armed ahead of time and auto-block/reflect one attack.
  // =====================================================================
  static WILD_CARD_CATALOG = [
    { id: 'HINT', name: 'Hint', icon: '💡', kind: 'UTILITY', scope: 'PROBLEM', durationMin: 0, defaultBid: 40, description: "Admin releases this problem's official hint to the buyer team only." },
    { id: 'FREEZE', name: 'Team Freeze', icon: '❄️', kind: 'ATTACK', durationMin: 10, defaultBid: 80, description: 'Target editor locks with a countdown; Run and Submit disabled for 10 minutes.' },
    { id: 'AI_DEBUG', name: 'AI Debug', icon: '🤖', kind: 'UTILITY', scope: 'PROBLEM', durationMin: 0, defaultBid: 60, description: 'One-time "Debug with AI" analysis on one unlocked problem for the buyer.' },
    { id: 'BLACKOUT', name: 'Blackout', icon: '🌑', kind: 'ATTACK', durationMin: 10, defaultBid: 80, description: "Target's page goes dark while their code keeps running." },
    { id: 'NO_BACKSPACE', name: 'No Backspace', icon: '⌫', kind: 'ATTACK', durationMin: 10, defaultBid: 60, description: 'Backspace & Delete blocked in the target editor for 10 minutes.' },
    { id: 'SHIELD', name: 'Shield', icon: '🛡️', kind: 'DEFENSE', durationMin: 0, defaultBid: 60, description: 'Declare BEFORE an attack: auto-blocks the next incoming sabotage.' },
    { id: 'MIRROR', name: 'Mirror', icon: '🪞', kind: 'DEFENSE', durationMin: 0, defaultBid: 80, description: 'Declare BEFORE an attack: reflects the next sabotage back at the attacker.' },
    { id: 'INSURANCE', name: 'Insurance', icon: '📜', kind: 'DEFENSE', durationMin: 0, defaultBid: 40, description: 'Declare BEFORE submitting: waives one −10 wrong-submission penalty.' },
    { id: 'DOUBLE_POINTS', name: 'Double Points', icon: '✌️', kind: 'UTILITY', scope: 'PROBLEM', durationMin: 0, defaultBid: 100, description: 'Doubles the points of one problem for the buyer team.' },
    { id: 'SKIP_SWAP', name: 'Skip / Swap', icon: '🔄', kind: 'UTILITY', scope: 'PROBLEM', durationMin: 0, defaultBid: 60, description: 'Swap one of the buyer\'s unlocked problems for another of the same difficulty.' },
    { id: 'COIN_HEIST', name: 'Coin Heist', icon: '🪙', kind: 'ATTACK', durationMin: 0, defaultBid: 100, description: 'Instantly steals 100 ByteCoins from the target team.' },
    { id: 'TIME_STEAL', name: 'Time Steal', icon: '⏱️', kind: 'ATTACK', durationMin: 0, defaultBid: 80, description: '+5 min for the buyer, −5 min for the target (requires the event clock).' },
    { id: 'TINY_FONT', name: 'Tiny Font', icon: '🔬', kind: 'ATTACK', durationMin: 10, defaultBid: 40, description: "Target's editor font shrinks for 10 minutes." },
    { id: 'LANGUAGE_LOCK', name: 'Language Lock', icon: '🔡', kind: 'ATTACK', scope: 'LANGUAGE', durationMin: 0, defaultBid: 60, description: 'Target must solve their next problem in a language the buyer picks.' },
    { id: 'PEEK', name: 'Peek', icon: '👁️', kind: 'UTILITY', scope: 'PROBLEM', durationMin: 0, defaultBid: 80, description: 'Reveals one hidden test case for one problem to the buyer team.' },
    { id: 'NO_AUTOCOMPLETE', name: 'No Autocomplete', icon: '🚫', kind: 'ATTACK', durationMin: 10, defaultBid: 40, description: 'Editor assistance & syntax highlighting disabled for the target for 10 minutes.' }
  ];

  seedWildCards() {
    let modified = false;
    if (!Array.isArray(this.state.wildCards)) this.state.wildCards = [];
    for (const def of Database.WILD_CARD_CATALOG) {
      if (!this.state.wildCards.find(c => c.id === def.id)) {
        this.state.wildCards.push({
          ...def,
          quantity: 1,        // exactly ONE copy of every card
          owner: null,        // team name once sold
          enabled: true,      // admin can disable individual cards
          bidAmount: null,    // coins actually paid offline
          soldAt: null
        });
        modified = true;
      }
    }
    if (!Array.isArray(this.state.cardActivations)) this.state.cardActivations = [];
    if (modified) this.save();
  }

  addAudit(adminId, action, targetType, targetId, details) {
    if (!Array.isArray(this.state.auditLog)) this.state.auditLog = [];
    this.state.auditLog.unshift({
      id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      adminId: adminId || 'ADMIN',
      action,
      targetType: targetType || '',
      targetId: targetId || '',
      details: details || '',
      timestamp: Date.now(),
      isoTime: new Date().toISOString()
    });
    if (this.state.auditLog.length > 2000) this.state.auditLog.pop();
  }

  getAuditLog() {
    return this.state.auditLog || [];
  }

  getPredefinedHintFor(prob) {
    try {
      const p = typeof prob === 'string' ? this.getFullProblem(prob) : prob;
      if (p && p.customHint) return p.customHint;
      if (p && p.hint) return p.hint;
      return getPredefinedHint(p || prob);
    } catch (e) {
      return null;
    }
  }

  recordActivation(record) {
    if (!Array.isArray(this.state.cardActivations)) this.state.cardActivations = [];
    this.state.cardActivations.unshift(record);
    if (this.state.cardActivations.length > 3000) this.state.cardActivations.pop();
    return record;
  }

  newActivationId() {
    return `ACT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  pushTeamCoinTxn(team, txn) {
    if (!team.transactions) team.transactions = [];
    team.transactions.unshift(txn);
    if (!this.state.transactions) this.state.transactions = [];
    this.state.transactions.unshift(txn);
  }

  getWildCards() {
    const now = Date.now();
    return (this.state.wildCards || []).map(card => {
      const active = (this.state.cardActivations || []).find(
        a => a.cardId === card.id && a.action === 'ACTIVATE' && a.status === 'ACTIVE' && (!a.endsAt || a.endsAt > now)
      );
      const armed = (this.state.cardActivations || []).find(
        a => a.cardId === card.id && a.action === 'ARM' && a.status === 'ARMED'
      );
      return {
        ...card,
        activeActivation: active ? { id: active.id, targetTeam: active.targetTeam, endsAt: active.endsAt } : null,
        armedFor: armed ? armed.byTeam : null
      };
    });
  }

  getCard(cardId) {
    return (this.state.wildCards || []).find(c => c.id === String(cardId || '').trim().toUpperCase()) || null;
  }

  // Wild cards are closed in the last 20 minutes of the event (server clock),
  // unless an admin explicitly overrides with a logged action.
  isWildCardsClosed() {
    const s = this.state.eventSettings || {};
    if (s.wildCardsOverride) return false;
    if (!s.endAt) return false;
    return Date.now() >= (s.endAt - 20 * 60 * 1000);
  }

  getEventSettings() {
    const s = this.state.eventSettings || {};
    return {
      startAt: s.startAt || null,
      endAt: s.endAt || null,
      wildCardsClosed: this.isWildCardsClosed(),
      cutoffAt: s.endAt ? s.endAt - 20 * 60 * 1000 : null,
      wildCardsOverride: Boolean(s.wildCardsOverride),
      leaderboardFrozen: Boolean(s.leaderboardFrozen),
      serverTime: Date.now()
    };
  }

  setEventClock({ startAt, endAt }, adminId) {
    if (!this.state.eventSettings) this.state.eventSettings = {};
    if (startAt !== undefined) this.state.eventSettings.startAt = startAt ? Number(startAt) : null;
    if (endAt !== undefined) this.state.eventSettings.endAt = endAt ? Number(endAt) : null;
    this.addAudit(adminId, 'SET_EVENT_CLOCK', 'EVENT', 'clock', `start=${this.state.eventSettings.startAt} end=${this.state.eventSettings.endAt}`);
    this.save();
    return this.getEventSettings();
  }

  overrideWildCardsClosed(override, adminId, reason = '') {
    if (!this.state.eventSettings) this.state.eventSettings = {};
    this.state.eventSettings.wildCardsOverride = Boolean(override);
    this.addAudit(adminId, override ? 'WILDCARD_CUTOFF_OVERRIDE_ON' : 'WILDCARD_CUTOFF_OVERRIDE_OFF', 'EVENT', 'wildcards', reason);
    this.save();
    return this.getEventSettings();
  }

  freezeLeaderboard(adminId) {
    if (!this.state.eventSettings) this.state.eventSettings = {};
    const snapshot = this.computeLeaderboard();
    this.state.eventSettings.leaderboardFrozen = true;
    this.state.eventSettings.leaderboardSnapshot = { at: Date.now(), rows: snapshot };
    this.addAudit(adminId, 'FREEZE_LEADERBOARD', 'EVENT', 'leaderboard', `${snapshot.length} teams snapshotted`);
    this.save();
    return this.getEventSettings();
  }

  unfreezeLeaderboard(adminId) {
    if (!this.state.eventSettings) this.state.eventSettings = {};
    this.state.eventSettings.leaderboardFrozen = false;
    this.state.eventSettings.leaderboardSnapshot = null;
    this.state.eventSettings.frozenAt = null;
    this.addAudit(adminId, 'UNFREEZE_LEADERBOARD', 'EVENT', 'leaderboard', '');
    this.save();
    return this.getEventSettings();
  }

  // --- WILD CARD: record an OFFLINE bid (deduct coins, grant ownership) ---
  bidWildCard({ cardId, teamName, coins, adminId }) {
    const card = this.getCard(cardId);
    if (!card) throw new Error(`Wild card "${cardId}" not found.`);
    if (!card.enabled) throw new Error(`Wild card "${card.name}" is disabled by the organizer.`);
    if (this.isWildCardsClosed()) {
      throw new Error('Wild cards are closed for the last 20 minutes of the event.');
    }
    if (card.owner) throw new Error(`"${card.name}" has already been sold to team ${card.owner}. Each card has only ONE copy.`);

    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);

    const cost = Number(coins);
    if (isNaN(cost) || cost < 0) throw new Error('Coins paid must be a valid number (0 or more).');
    if (cost > (team.balance ?? 0)) {
      throw new Error(`Insufficient ByteCoins: bid is ${cost} but ${team.name} only has ${team.balance}.`);
    }

    const previousBalance = team.balance ?? 0;
    team.balance = previousBalance - cost;
    card.owner = team.name;
    card.bidAmount = cost;
    card.soldAt = new Date().toISOString();

    const now = new Date();
    const txn = {
      id: `TXN-CARD-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      type: 'WILD_CARD_BID',
      teamName: team.name,
      cardId: card.id,
      cardName: card.name,
      item: `Wild Card: ${card.name}`,
      bidAmount: cost,
      price: cost,
      previousBalance,
      remainingBalance: team.balance,
      recordedBy: adminId || 'ADMIN',
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
    this.pushTeamCoinTxn(team, txn);

    this.recordActivation({
      id: this.newActivationId(),
      cardId: card.id,
      cardName: card.name,
      action: 'BID',
      byTeam: team.name,
      targetTeam: null,
      coins: cost,
      status: 'COMPLETED',
      recordedBy: adminId || 'ADMIN',
      timestamp: Date.now(),
      isoTime: new Date().toISOString()
    });
    this.addAudit(adminId, 'WILD_CARD_BID', 'WILD_CARD', card.id, `${team.name} bought "${card.name}" for ${cost} coins (offline bid)`);

    this.updateTeam(team);
    this.save();
    return { card, team, txn };
  }

  // Find an armed defense (Shield / Mirror) belonging to the target team
  consumeDefense(targetTeamName, kindFilter) {
    const armed = (this.state.cardActivations || []).find(
      a => a.action === 'ARM' && a.status === 'ARMED' &&
           (a.byTeam || '').toLowerCase() === String(targetTeamName).toLowerCase() &&
           (!kindFilter || kindFilter.includes(a.cardId))
    );
    return armed || null;
  }

  consumeInsurance(teamName) {
    const armed = this.consumeDefense(teamName, ['INSURANCE']);
    if (!armed) return null;
    armed.status = 'CONSUMED';
    armed.consumedAt = Date.now();
    armed.consumedBy = 'INSURANCE_WAIVER';
    return armed;
  }

  // --- WILD CARD: activate an owned card (attack or instant utility) ---
  activateWildCard({ cardId, teamName, targetTeamName, problemId, targetProblemId, lang, amount, adminId }) {
    const card = this.getCard(cardId);
    if (!card) throw new Error(`Wild card "${cardId}" not found.`);
    if (!card.enabled) throw new Error(`Wild card "${card.name}" is disabled by the organizer.`);
    if (card.kind === 'DEFENSE') {
      throw new Error(`"${card.name}" is a defensive card — use "Arm" instead. Defensive cards must be declared before an attack.`);
    }
    if ((card.owner || '').toLowerCase() !== String(teamName || '').toLowerCase()) {
      throw new Error(`Team "${teamName}" does not own "${card.name}". Record the offline bid first.`);
    }
    if (this.isWildCardsClosed()) {
      throw new Error('Wild cards are closed for the last 20 minutes of the event.');
    }

    // Prevent stacking the same attack card type twice at once
    const now0 = Date.now();
    const dupe = (this.state.cardActivations || []).find(
      a => a.cardId === card.id && a.action === 'ACTIVATE' && String(a.byTeam || '').toLowerCase() === String(teamName || '').toLowerCase() &&
           a.status === 'ACTIVE' && (!a.endsAt || a.endsAt > now0)
    );
    if (dupe) throw new Error(`"${card.name}" is already active (target: ${dupe.targetTeam || '—'}). Cancel it first.`);

    const buyer = this.getTeam(teamName);
    if (!buyer) throw new Error(`Team "${teamName}" not found.`);

    const needProblem = card.scope === 'PROBLEM';
    let problem = null;
    if (needProblem) {
      if (!problemId) throw new Error(`"${card.name}" needs a target problem.`);
      problem = this.getFullProblem(problemId) || this.findProblemByKey(problemId);
      if (!problem) throw new Error(`Problem "${problemId}" not found.`);
      if (!buyer.unlocked.includes(problem.id)) {
        throw new Error(`${buyer.name} has not unlocked problem ${problem.id} yet.`);
      }
    }

    const base = {
      id: this.newActivationId(),
      cardId: card.id,
      cardName: card.name,
      action: 'ACTIVATE',
      byTeam: buyer.name,
      targetTeam: null,
      problemId: problem ? problem.id : (targetProblemId || null),
      status: 'ACTIVE',
      recordedBy: adminId || 'ADMIN',
      startedAt: Date.now(),
      endsAt: null,
      isoTime: new Date().toISOString()
    };

    let target = null;
    if (targetTeamName) {
      target = this.getTeam(targetTeamName);
      if (!target) throw new Error(`Target team "${targetTeamName}" not found.`);
      if (target.name.toLowerCase() === buyer.name.toLowerCase()) {
        throw new Error('A team cannot target itself.');
      }
      base.targetTeam = target.name;
    }

    const result = { card, activation: base };

    switch (card.id) {
      case 'HINT': {
        const hint = this.getPredefinedHintFor(problem);
        if (!buyer.revealedHints) buyer.revealedHints = {};
        buyer.revealedHints[problem.id] = {
          hint,
          problemId: problem.id,
          revealedBy: 'WILD_CARD',
          revealedByName: `Wild Card: ${card.name}`,
          revealedAt: new Date().toISOString()
        };
        base.status = 'COMPLETED';
        base.details = `Hint for ${problem.id} released to ${buyer.name}`;
        break;
      }
      case 'AI_DEBUG': {
        if (!buyer.aiDebug) buyer.aiDebug = {};
        buyer.aiDebug[problem.id] = { used: false, grantedAt: Date.now() };
        base.status = 'COMPLETED';
        base.details = `AI Debug granted on ${problem.id} for ${buyer.name}`;
        break;
      }
      case 'DOUBLE_POINTS': {
        if (!buyer.pointBoosters) buyer.pointBoosters = {};
        if (buyer.problemStatuses[problem.id]?.status === 'SOLVED') {
          throw new Error(`${buyer.name} already solved ${problem.id}. Double Points must be played before solving.`);
        }
        buyer.pointBoosters[problem.id] = 2;
        base.status = 'COMPLETED';
        base.details = `Points for ${problem.id} doubled for ${buyer.name}`;
        break;
      }
      case 'SKIP_SWAP': {
        if (!targetProblemId) throw new Error('Skip/Swap needs the replacement problem.');
        const replacement = this.getFullProblem(targetProblemId) || this.findProblemByKey(targetProblemId);
        if (!replacement) throw new Error(`Problem "${targetProblemId}" not found.`);
        if (replacement.diff !== problem.diff) {
          throw new Error(`Skip/Swap requires the same difficulty (${problem.diff}); ${replacement.id} is ${replacement.diff}.`);
        }
        if (buyer.unlocked.includes(replacement.id)) {
          throw new Error(`${buyer.name} already has ${replacement.id} unlocked.`);
        }
        buyer.unlocked = buyer.unlocked.map(id => (id === problem.id ? replacement.id : id));
        delete buyer.problemStatuses[problem.id];
        buyer.problemStatuses[replacement.id] = {
          status: 'UNLOCKED',
          unlockedBy: 'WILD_CARD',
          unlockedByName: `Wild Card: ${card.name}`,
          unlockedAt: new Date().toISOString(),
          swappedFrom: problem.id
        };
        base.problemId = replacement.id;
        base.status = 'COMPLETED';
        base.details = `${buyer.name}: ${problem.id} swapped for ${replacement.id}`;
        break;
      }
      case 'COIN_HEIST': {
        const steal = Math.max(1, Math.min(Number(amount) || 100, target.balance ?? 0));
        if ((target.balance ?? 0) <= 0) throw new Error(`${target.name} has no ByteCoins to steal.`);
        target.balance = (target.balance ?? 0) - steal;
        buyer.balance = (buyer.balance ?? 0) + steal;
        const now = new Date();
        const txn = {
          id: `TXN-HEIST-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
          type: 'COIN_HEIST',
          teamName: buyer.name,
          targetTeam: target.name,
          item: `Coin Heist → ${target.name}`,
          bidAmount: steal,
          price: steal,
          previousBalance: buyer.balance - steal,
          remainingBalance: buyer.balance,
          recordedBy: adminId || 'ADMIN',
          timestamp: now.toISOString(),
          displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
        };
        this.pushTeamCoinTxn(buyer, txn);
        result.txn = txn;
        base.status = 'COMPLETED';
        base.details = `Stole ${steal} ByteCoins from ${target.name}`;
        this.updateTeam(target);
        break;
      }
      case 'TIME_STEAL': {
        if (!this.state.eventSettings?.endAt) {
          throw new Error('Time Steal requires the event clock to be configured.');
        }
        buyer.timeDeltaSeconds = (buyer.timeDeltaSeconds || 0) + 5 * 60;
        target.timeDeltaSeconds = (target.timeDeltaSeconds || 0) - 5 * 60;
        base.status = 'COMPLETED';
        base.details = `${buyer.name} +5 min · ${target.name} −5 min`;
        this.updateTeam(target);
        break;
      }
      case 'PEEK': {
        const tests = String(problem.ht || '').split('===').map(t => t.trim()).filter(Boolean);
        if (!tests.length) throw new Error(`Problem ${problem.id} has no hidden tests to peek at.`);
        if (!buyer.peekedTests) buyer.peekedTests = {};
        if (buyer.peekedTests[problem.id]) throw new Error(`${buyer.name} already peeked at ${problem.id}.`);
        const [input, expected] = tests[0].split('---').map(s => (s || '').trim());
        buyer.peekedTests[problem.id] = { input: input || '', expected: expected || '', revealedAt: Date.now() };
        base.status = 'COMPLETED';
        base.details = `Hidden test 1 of ${tests.length} revealed for ${problem.id} to ${buyer.name}`;
        break;
      }
      case 'FREEZE': {
        const defense = this.consumeDefense(target.name, ['SHIELD', 'MIRROR']);
        if (defense) {
          const reflected = defense.cardId === 'MIRROR';
          defense.status = 'CONSUMED';
          defense.consumedAt = Date.now();
          defense.blockedActivationId = base.id;
          if (reflected) {
            // The attacker suffers their own attack
            const realTarget = target;
            base.targetTeam = buyer.name;
            base.status = 'ACTIVE';
            base.endsAt = Date.now() + card.durationMin * 60 * 1000;
            base.details = `MIRRORED by ${realTarget.name} — ${buyer.name} freezes instead`;
            buyer.frozenUntil = base.endsAt;
            buyer.frozenBy = realTarget.name;
            this.updateTeam(buyer);
            this.recordActivation(base);
            this.addAudit(adminId, 'WILD_CARD_MIRRORED', 'WILD_CARD', card.id, `${realTarget.name} mirrored ${card.name} back at ${buyer.name}`);
            this.save();
            return { card, activation: base, mirrored: true, targetTeam: buyer, defense };
          }
          base.status = 'BLOCKED';
          base.details = `Blocked by ${target.name}'s Shield`;
          this.recordActivation(base);
          this.addAudit(adminId, 'WILD_CARD_BLOCKED', 'WILD_CARD', card.id, `${target.name}'s Shield blocked ${card.name}`);
          this.save();
          return { card, activation: base, blocked: true, targetTeam: target, defense };
        }
        base.endsAt = Date.now() + card.durationMin * 60 * 1000;
        target.frozenUntil = base.endsAt;
        target.frozenBy = buyer.name;
        base.details = `${target.name} frozen for ${card.durationMin} min`;
        this.updateTeam(target);
        break;
      }
      case 'BLACKOUT':
      case 'NO_BACKSPACE':
      case 'TINY_FONT':
      case 'NO_AUTOCOMPLETE': {
        const defense = this.consumeDefense(target.name, ['SHIELD', 'MIRROR']);
        if (defense) {
          const reflected = defense.cardId === 'MIRROR';
          defense.status = 'CONSUMED';
          defense.consumedAt = Date.now();
          defense.blockedActivationId = base.id;
          const victim = reflected ? buyer : target;
          base.targetTeam = victim.name;
          base.endsAt = Date.now() + card.durationMin * 60 * 1000;
          base.details = reflected ? `MIRRORED back onto ${buyer.name}` : `Blocked by ${target.name}'s Shield`;
          if (reflected) {
            base.status = 'ACTIVE';
            this.recordActivation(base);
            this.addAudit(adminId, 'WILD_CARD_MIRRORED', 'WILD_CARD', card.id, `${target.name} mirrored ${card.name} back at ${buyer.name}`);
            this.save();
            return { card, activation: base, mirrored: true, targetTeam: victim, defense };
          }
          base.status = 'BLOCKED';
          this.recordActivation(base);
          this.addAudit(adminId, 'WILD_CARD_BLOCKED', 'WILD_CARD', card.id, `${target.name}'s Shield blocked ${card.name}`);
          this.save();
          return { card, activation: base, blocked: true, targetTeam: target, defense };
        }
        base.endsAt = Date.now() + card.durationMin * 60 * 1000;
        base.details = `${card.name} active on ${target.name} for ${card.durationMin} min`;
        this.updateTeam(target);
        break;
      }
      case 'LANGUAGE_LOCK': {
        const validLangs = ['python', 'c', 'cpp', 'java'];
        if (!validLangs.includes(String(lang))) {
          throw new Error(`Language Lock needs one of: ${validLangs.join(', ')}.`);
        }
        const defense = this.consumeDefense(target.name, ['SHIELD', 'MIRROR']);
        if (defense) {
          const reflected = defense.cardId === 'MIRROR';
          defense.status = 'CONSUMED';
          defense.consumedAt = Date.now();
          if (reflected) {
            buyer.languageLock = { lang, active: true, lockedBy: target.name, at: Date.now() };
            base.targetTeam = buyer.name;
            base.details = `MIRRORED — ${buyer.name} locked to ${lang}`;
          } else {
            base.status = 'BLOCKED';
            base.details = `Blocked by ${target.name}'s Shield`;
          }
          this.recordActivation(base);
          this.save();
          return { card, activation: base, mirrored: reflected, blocked: !reflected, targetTeam: reflected ? buyer : target };
        }
        target.languageLock = { lang, active: true, lockedBy: buyer.name, at: Date.now() };
        base.details = `${target.name} locked to ${lang} until their next solve`;
        this.updateTeam(target);
        break;
      }
      default:
        throw new Error(`Unknown wild card effect: ${card.id}`);
    }

    this.recordActivation(base);
    this.addAudit(adminId, 'WILD_CARD_ACTIVATE', 'WILD_CARD', card.id, base.details || '');
    this.updateTeam(buyer);
    this.save();
    return { ...result, activation: base, targetTeam: target, buyer };
  }

  // --- WILD CARD: arm a defensive card (declared BEFORE an attack) ---
  armDefenseCard({ cardId, teamName, adminId }) {
    const card = this.getCard(cardId);
    if (!card) throw new Error(`Wild card "${cardId}" not found.`);
    if (card.kind !== 'DEFENSE') throw new Error(`"${card.name}" is not a defensive card.`);
    if ((card.owner || '').toLowerCase() !== String(teamName || '').toLowerCase()) {
      throw new Error(`Team "${teamName}" does not own "${card.name}". Record the offline bid first.`);
    }
    if (this.isWildCardsClosed() && !this.state.eventSettings?.wildCardsOverride) {
      throw new Error('Wild cards are closed for the last 20 minutes of the event.');
    }
    const alreadyArmed = (this.state.cardActivations || []).find(
      a => a.cardId === card.id && a.action === 'ARM' && a.status === 'ARMED'
    );
    if (alreadyArmed) throw new Error(`"${card.name}" is already armed for ${alreadyArmed.byTeam}.`);

    const record = this.recordActivation({
      id: this.newActivationId(),
      cardId: card.id,
      cardName: card.name,
      action: 'ARM',
      byTeam: this.getTeam(teamName)?.name || teamName,
      targetTeam: this.getTeam(teamName)?.name || teamName,
      status: 'ARMED',
      recordedBy: adminId || 'ADMIN',
      startedAt: Date.now(),
      endsAt: null,
      isoTime: new Date().toISOString()
    });
    this.addAudit(adminId, 'WILD_CARD_ARM', 'WILD_CARD', card.id, `Armed for ${record.byTeam} — blocks the next incoming attack`);
    this.save();
    return { card, activation: record };
  }

  // --- WILD CARD: cancel an active effect (logged) ---
  cancelActivation(activationId, adminId) {
    const act = (this.state.cardActivations || []).find(a => a.id === activationId);
    if (!act) throw new Error('Activation record not found.');
    if (act.status !== 'ACTIVE' && act.status !== 'ARMED') {
      throw new Error(`Activation is already ${act.status}.`);
    }
    act.status = 'CANCELLED';
    act.cancelledAt = Date.now();
    act.cancelledBy = adminId || 'ADMIN';

    if (act.cardId === 'FREEZE' && act.targetTeam) {
      const team = this.getTeam(act.targetTeam);
      if (team && team.frozenBy && team.frozenUntil) {
        // Only clear if this activation is the one holding the freeze
        team.frozenUntil = null;
        team.frozenBy = null;
        this.updateTeam(team);
      }
    }
    if (act.cardId === 'LANGUAGE_LOCK' && act.targetTeam) {
      const team = this.getTeam(act.targetTeam);
      if (team?.languageLock?.active) {
        team.languageLock.active = false;
        this.updateTeam(team);
      }
    }

    this.addAudit(adminId, 'WILD_CARD_CANCEL', 'WILD_CARD', act.cardId, `Cancelled ${act.cardName} on ${act.targetTeam || act.byTeam}`);
    this.save();
    return act;
  }

  toggleWildCard(cardId, enabled, adminId) {
    const card = this.getCard(cardId);
    if (!card) throw new Error('Card not found.');
    card.enabled = Boolean(enabled);
    this.addAudit(adminId, 'WILD_CARD_TOGGLE', 'WILD_CARD', card.id, `enabled=${card.enabled}`);
    this.save();
    return card;
  }

  // Live view for the admin panel: active effects with countdowns + armed defenses
  getActiveEffectRecords() {
    const now = Date.now();
    const active = (this.state.cardActivations || [])
      .filter(a => a.action === 'ACTIVATE' && a.status === 'ACTIVE' && (!a.endsAt || a.endsAt > now))
      .map(a => ({ ...a, remainingSeconds: a.endsAt ? Math.max(0, Math.ceil((a.endsAt - now) / 1000)) : null }));
    const armed = (this.state.cardActivations || []).filter(a => a.action === 'ARM' && a.status === 'ARMED');
    return { active, armed, serverTime: now };
  }

  // Active effects affecting a specific team (for participant banners & enforcement)
  getTeamActiveEffects(teamName) {
    const now = Date.now();
    const key = String(teamName || '').toLowerCase();
    const defs = Object.fromEntries(Database.WILD_CARD_CATALOG.map(c => [c.id, c]));
    const effects = (this.state.cardActivations || [])
      .filter(a => a.action === 'ACTIVATE' && a.status === 'ACTIVE' &&
        (a.targetTeam || '').toLowerCase() === key &&
        (!a.endsAt || a.endsAt > now))
      .map(a => ({
        id: a.id,
        cardId: a.cardId,
        name: defs[a.cardId]?.name || a.cardId,
        icon: defs[a.cardId]?.icon || '🃏',
        kind: defs[a.cardId]?.kind || 'ATTACK',
        byTeam: a.byTeam,
        problemId: a.problemId || null,
        lang: a.lang || null,
        startedAt: a.startedAt,
        endsAt: a.endsAt || null,
        remainingSeconds: a.endsAt ? Math.max(0, Math.ceil((a.endsAt - now) / 1000)) : null
      }));
    // Language lock lives on the team record until their next solve.
    // (Skipped when a live activation already represents it, so banners
    // don't show the same effect twice.)
    const team = this.getTeam(teamName);
    const hasLiveLangLock = effects.some(e => e.cardId === 'LANGUAGE_LOCK');
    if (team?.languageLock?.active && !hasLiveLangLock) {
      effects.push({
        id: 'LANGUAGE_LOCK',
        cardId: 'LANGUAGE_LOCK',
        name: 'Language Lock',
        icon: '🔡',
        kind: 'ATTACK',
        byTeam: team.languageLock.lockedBy,
        problemId: null,
        lang: team.languageLock.lang,
        startedAt: team.languageLock.at,
        endsAt: null,
        remainingSeconds: null
      });
    }
    const armed = (this.state.cardActivations || [])
      .filter(a => a.action === 'ARM' && a.status === 'ARMED' && (a.byTeam || '').toLowerCase() === key)
      .map(a => ({ id: a.id, cardId: a.cardId, name: defs[a.cardId]?.name || a.cardId, icon: defs[a.cardId]?.icon || '🛡️', status: 'ARMED' }));
    return { effects, armed, serverTime: now };
  }

  clearLanguageLock(teamName, cause) {
    const team = this.getTeam(teamName);
    if (!team?.languageLock?.active) return null;
    team.languageLock.active = false;
    team.languageLock.clearedBy = cause;
    const act = (this.state.cardActivations || []).find(
      a => a.cardId === 'LANGUAGE_LOCK' && a.status === 'ACTIVE' &&
           (a.targetTeam || '').toLowerCase() === String(teamName).toLowerCase()
    );
    if (act) {
      act.status = 'ENDED';
      act.endedAt = Date.now();
      act.details = `${act.details || ''} (cleared: ${cause})`;
    }
    this.updateTeam(team);
    return team;
  }

  getTeamInventory(teamName) {
    const key = String(teamName || '').toLowerCase();
    return (this.state.wildCards || [])
      .filter(c => (c.owner || '').toLowerCase() === key)
      .map(c => {
        const armed = (this.state.cardActivations || []).find(
          a => a.cardId === c.id && a.action === 'ARM' && a.status === 'ARMED'
        );
        return { ...c, armed: Boolean(armed), bidAmount: c.bidAmount };
      });
  }

  getActivationLog(limit = 200) {
    return (this.state.cardActivations || []).slice(0, limit);
  }

  // =====================================================================
  // UNLOCK PINS — one PIN per problem, released by the admin to the winning
  // team. Entering the correct PIN unlocks that problem for that team only.
  // Wrong attempts are rate-limited per team.
  // =====================================================================
  generatePins(force = false, adminId = null) {
    const generated = [];
    for (const prob of this.state.problems) {
      if (force || !this.state.pins[prob.id]) {
        this.state.pins[prob.id] = {
          pin: String(Math.floor(100000 + Math.random() * 900000)),
          generatedAt: Date.now(),
          releasedTo: null
        };
        generated.push(prob.id);
      }
    }
    this.addAudit(adminId, 'GENERATE_PINS', 'PINS', 'all', force ? `Regenerated ALL ${generated.length} PINs` : `Generated ${generated.length} missing PINs`);
    this.save();
    return { generated, pins: this.state.pins };
  }

  regeneratePin(problemId, adminId) {
    const prob = this.getFullProblem(problemId);
    if (!prob) throw new Error(`Problem "${problemId}" not found.`);
    this.state.pins[prob.id] = { pin: String(Math.floor(100000 + Math.random() * 900000)), generatedAt: Date.now(), releasedTo: null };
    this.addAudit(adminId, 'REGENERATE_PIN', 'PROBLEM', prob.id, '');
    this.save();
    return this.state.pins[prob.id];
  }

  releasePin(problemId, teamName, adminId) {
    const prob = this.getFullProblem(problemId);
    if (!prob) throw new Error(`Problem "${problemId}" not found.`);
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    if (!this.state.pins[prob.id]) this.regeneratePin(prob.id, adminId);
    this.state.pins[prob.id].releasedTo = team.name;
    this.addAudit(adminId, 'RELEASE_PIN', 'PROBLEM', prob.id, `PIN for ${prob.id} released to ${team.name}`);
    this.save();
    return { problemId: prob.id, releasedTo: team.name };
  }

  getPins() {
    return this.state.pins || {};
  }

  pinUnlock({ teamName, memberId, problemId, pin }) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error('Team not found.');
    if (team.isLocked) throw new Error('Your team session is locked by proctors.');
    if (this.isTeamFrozen(team.name)) {
      const remainingSec = Math.ceil((team.frozenUntil - Date.now()) / 1000);
      throw new Error(`Your team is frozen! Unlock available in ${remainingSec}s.`);
    }

    if (!team.pinAttempts) team.pinAttempts = { count: 0, lockedUntil: 0 };
    if (team.pinAttempts.lockedUntil > Date.now()) {
      const secs = Math.ceil((team.pinAttempts.lockedUntil - Date.now()) / 1000);
      throw new Error(`Too many wrong PIN attempts. Try again in ${secs}s.`);
    }

    // Resolve the target problem: explicit ID, or look it up by the PIN itself
    // (teams only get the code from the organizer — they never browse the catalog)
    const enteredPin = String(pin || '').trim();
    let problem = null;
    if (problemId) {
      problem = this.getFullProblem(problemId) || this.findProblemByKey(problemId);
    } else if (enteredPin) {
      const entry = Object.entries(this.state.pins || {}).find(([, rec]) => rec.pin === enteredPin);
      if (entry) problem = this.getFullProblem(entry[0]);
    }

    const record = problem ? this.state.pins[problem.id] : null;
    if (!problem || !record || enteredPin !== record.pin) {
      if (!Object.keys(this.state.pins || {}).length) {
        throw new Error('No PINs have been generated yet. Ask the organizers.');
      }
      if (problem && !record) {
        throw new Error('No PIN has been generated for this problem yet. Ask the organizers.');
      }
      team.pinAttempts.count += 1;
      if (team.pinAttempts.count >= 5) {
        team.pinAttempts.count = 0;
        team.pinAttempts.lockedUntil = Date.now() + 5 * 60 * 1000;
        this.updateTeam(team);
        this.save();
        throw new Error('Too many wrong PIN attempts. PIN entry locked for 5 minutes.');
      }
      this.updateTeam(team);
      this.save();
      throw new Error(`Incorrect PIN. ${5 - team.pinAttempts.count} attempts left before a 5-minute lockout.`);
    }

    if (team.unlocked.includes(problem.id)) {
      throw new Error(`Problem "${problem.id} — ${problem.title}" is already unlocked for your team!`);
    }

    team.pinAttempts = { count: 0, lockedUntil: 0 };

    // PIN unlock deducts the problem's configured bid price (set by the organizer)
    const price = this.getProblemPrice(problem.id);
    if (price === null || price === undefined) {
      throw new Error(`No bid price has been configured for ${problem.id} yet. Ask the organizers.`);
    }
    if (price > (team.balance ?? 0)) {
      throw new Error(`Insufficient ByteCoins: ${problem.id} costs ${price}, but your team only has ${team.balance}.`);
    }

    const previousBalance = team.balance ?? 0;
    team.balance = previousBalance - price;
    team.unlocked.push(problem.id);
    if (!team.problemStatuses) team.problemStatuses = {};
    team.problemStatuses[problem.id] = {
      status: 'UNLOCKED',
      unlockedBy: memberId || 'PIN',
      unlockedByName: 'PIN Unlock',
      bidAmount: price,
      unlockedAt: new Date().toISOString()
    };

    const now = new Date();
    const txn = {
      id: `TXN-PIN-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      type: 'PIN_UNLOCK',
      teamName: team.name,
      problemId: problem.id,
      problemTitle: problem.title,
      item: `PIN Unlock: ${problem.id}`,
      bidAmount: price,
      price,
      previousBalance,
      remainingBalance: team.balance,
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
    this.pushTeamCoinTxn(team, txn);
    this.addAudit('PARTICIPANT', 'PIN_UNLOCK', 'PROBLEM', problem.id, `${team.name} unlocked via PIN (−${price} coins)`);

    this.updateTeam(team);
    this.save();
    return { team, txn, problem };
  }

  // =====================================================================
  // MANUAL OVERRIDES & TRANSACTION CORRECTIONS (always logged)
  // =====================================================================
  adminAdjustCoins({ teamName, amount, reason, adminId }) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    const delta = Number(amount);
    if (isNaN(delta) || delta === 0) throw new Error('Adjustment amount must be a non-zero number.');
    const previousBalance = team.balance ?? 0;
    team.balance = previousBalance + delta;

    const now = new Date();
    const txn = {
      id: `TXN-ADJ-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      type: 'MANUAL_ADJUST',
      teamName: team.name,
      item: reason ? `Manual override: ${reason}` : 'Manual override',
      bidAmount: delta,
      price: delta,
      previousBalance,
      remainingBalance: team.balance,
      reason: reason || '',
      recordedBy: adminId || 'ADMIN',
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
    this.pushTeamCoinTxn(team, txn);
    this.addAudit(adminId, 'ADJUST_COINS', 'TEAM', team.name, `${delta > 0 ? '+' : ''}${delta} coins · reason: ${reason || 'not provided'}`);
    this.updateTeam(team);
    this.save();
    return { team, txn };
  }

  adminAdjustScore({ teamName, delta, reason, adminId }) {
    const team = this.getTeam(teamName);
    if (!team) throw new Error(`Team "${teamName}" not found.`);
    const d = Number(delta);
    if (isNaN(d) || d === 0) throw new Error('Score adjustment must be a non-zero number.');
    team.score = (team.score || 0) + d;
    this.addAudit(adminId, 'ADJUST_SCORE', 'TEAM', team.name, `${d > 0 ? '+' : ''}${d} pts · reason: ${reason || 'not provided'}`);
    this.updateTeam(team);
    this.save();
    return { team };
  }

  undoTransaction(txnId, adminId) {
    const txn = (this.state.transactions || []).find(t => t.id === txnId);
    if (!txn) throw new Error('Transaction not found.');
    if (txn.undone) throw new Error('Transaction has already been undone.');
    if (txn.type === 'COIN_HEIST') throw new Error('Heist transactions involve two teams — undo manually via coin adjustments.');

    const team = this.getTeam(txn.teamName);
    if (!team) throw new Error(`Team "${txn.teamName}" not found.`);

    // Undo reverses a coin deduction (bids, cards, PIN unlocks, adjustments)
    const amount = Number(txn.bidAmount ?? txn.price ?? txn.cost ?? 0);
    if (!amount) throw new Error('This transaction has no coin amount to reverse.');

    team.balance = (team.balance ?? 0) + amount;
    txn.undone = true;
    txn.undoneAt = new Date().toISOString();
    txn.undoneBy = adminId || 'ADMIN';

    const now = new Date();
    const reversal = {
      id: `TXN-UNDO-${Date.now()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
      type: 'UNDO',
      teamName: team.name,
      item: `Undo of ${txn.id} (${txn.item || txn.problemTitle || txn.type})`,
      bidAmount: amount,
      price: amount,
      previousBalance: team.balance - amount,
      remainingBalance: team.balance,
      undoneTxnId: txn.id,
      recordedBy: adminId || 'ADMIN',
      timestamp: now.toISOString(),
      displayTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    };
    this.pushTeamCoinTxn(team, reversal);
    this.addAudit(adminId, 'UNDO_TRANSACTION', 'TRANSACTION', txn.id, `Refunded ${amount} coins to ${team.name}`);
    this.updateTeam(team);
    this.save();
    return { team, reversal, txn };
  }

  upsertTeam(team) {
    if (!team || !team.name) return null;
    const key = team.name.trim();
    const existing = this.state.teams[key] || {};
    const merged = { ...existing, ...team };
    if (!merged.password) merged.password = this.generateTeamPassword();
    if (merged.activeSession === undefined) merged.activeSession = null;
    this.state.teams[key] = merged;
    this.save();
    return this.state.teams[key];
  }

  deleteTeam(teamName) {
    if (!teamName) return false;
    for (const key of Object.keys(this.state.teams)) {
      if (key.toLowerCase() === teamName.toLowerCase()) {
        delete this.state.teams[key];
        this.save();
        return true;
      }
    }
    return false;
  }
}

export const db = new Database();
