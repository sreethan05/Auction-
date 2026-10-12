import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes('your-project')) {
  try {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase client initialized:', SUPABASE_URL);
  } catch (err) {
    console.error('❌ Failed to initialize Supabase client:', err.message);
  }
} else {
  console.log('ℹ️ Supabase not configured in .env (running in local atomic store mode).');
}

export function isSupabaseReady() {
  return supabaseClient !== null;
}

export function getSupabaseClient() {
  return supabaseClient;
}

/**
 * Sync a team and its members (1, 2, or 3 members) to Supabase
 */
export async function syncTeamToSupabase(team) {
  if (!supabaseClient || !team) return { success: false, reason: 'Supabase not configured' };

  try {
    // 1. Upsert team
    const { data: teamRow, error: teamErr } = await supabaseClient
      .from('teams')
      .upsert({
        name: team.name,
        score: team.score || 0,
        balance: team.balance ?? 1000,
        wrong_attempts: team.wrong || 0,
        is_locked: Boolean(team.isLocked),
        lock_reason: team.lockReason || ''
      }, { onConflict: 'name' })
      .select('id, name')
      .single();

    if (teamErr) {
      console.error('Supabase team sync error:', teamErr);
      return { success: false, error: teamErr };
    }

    // 2. Upsert team members
    const teamId = teamRow.id;
    const members = team.members || [];
    for (const m of members) {
      await supabaseClient
        .from('team_members')
        .upsert({
          team_id: teamId,
          team_name: team.name,
          member_id: m.memberId,
          name: m.name,
          email: m.email || '',
          roll_no: m.rollNo || '',
          phone: m.phone || '',
          college: m.college || '',
          is_captain: Boolean(m.isCaptain)
        }, { onConflict: 'team_name,member_id' });
    }

    return { success: true, teamId };
  } catch (err) {
    console.error('Error syncing team to Supabase:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch all teams and their 1-3 members from Supabase
 */
export async function fetchTeamsFromSupabase() {
  if (!supabaseClient) return null;

  try {
    const { data: teams, error: tErr } = await supabaseClient
      .from('teams')
      .select('*, members:team_members(*)');

    if (tErr) {
      console.error('Failed to fetch teams from Supabase:', tErr);
      return null;
    }
    return teams;
  } catch (err) {
    console.error('Supabase fetch error:', err);
    return null;
  }
}

/**
 * Parse Google Sheet CSV content or link and group into teams of 1, 2, or 3 users
 */
export function parseSheetRowsToTeams(rows, usersPerTeam = 2, teamPrefix = 'TEAM') {
  // rows is an array of objects: { name, email, rollNo, phone, college, teamName }
  const cleanRows = [];

  function getVal(row, candidates) {
    const keys = Object.keys(row);
    for (const c of candidates) {
      const normC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of keys) {
        const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normK === normC) {
          const val = row[k];
          if (val !== undefined && val !== null && String(val).trim().length > 0) {
            return String(val).trim();
          }
        }
      }
    }
    return '';
  }

  for (const r of rows) {
    const name = getVal(r, ['name', 'fullname', 'studentname', 'candidatename', 'membername', 'participantname', 'user']);
    if (!name) continue;

    const email = getVal(r, ['email', 'emailaddress', 'mail', 'emailid']);
    const rollNo = getVal(r, ['rollno', 'rollnumber', 'roll', 'registrationno', 'regno', 'usn', 'htno', 'hallticket', 'id', 'studentid']);
    const phone = getVal(r, ['phone', 'phonenumber', 'mobile', 'mobileno', 'contact', 'contactno']);
    const college = getVal(r, ['college', 'collegename', 'institution', 'university', 'campus', 'institute']);
    const explicitTeam = getVal(r, ['teamname', 'team', 'teamid', 'group', 'groupname']);

    cleanRows.push({
      name,
      email,
      rollNo,
      phone,
      college,
      explicitTeam
    });
  }

  const teamsResult = [];

  // If explicit team names are provided in the sheet:
  const hasExplicitTeams = cleanRows.some(r => r.explicitTeam.length > 0);

  if (hasExplicitTeams) {
    const grouped = {};
    for (const user of cleanRows) {
      const tName = user.explicitTeam || `TEAM_${Object.keys(grouped).length + 1}`;
      if (!grouped[tName]) grouped[tName] = [];
      grouped[tName].push(user);
    }

    for (const [teamName, members] of Object.entries(grouped)) {
      // Limit to 1 to 3 members per team
      const capped = members.slice(0, 3);
      const teamId = teamName.toUpperCase().replace(/[^A-Z0-9_-]/g, '_');
      const teamMembers = capped.map((m, idx) => ({
        memberId: `${teamId}-M0${idx + 1}`,
        name: m.name,
        isCaptain: idx === 0,
        rollNo: m.rollNo,
        phone: m.phone,
        email: m.email,
        college: m.college
      }));

      teamsResult.push({
        id: teamId,
        name: teamName,
        size: teamMembers.length,
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
      });
    }
  } else {
    // Automatically pair candidates into teams (e.g. 2 users per team)
    const effectiveSize = Math.max(1, Math.min(3, parseInt(usersPerTeam, 10) || 2));
    let teamCounter = 1;

    for (let i = 0; i < cleanRows.length; i += effectiveSize) {
      const chunk = cleanRows.slice(i, i + effectiveSize);
      const teamName = `${teamPrefix}_${String(teamCounter).padStart(2, '0')}`;
      const teamId = teamName.toUpperCase();

      const teamMembers = chunk.map((m, idx) => ({
        memberId: `${teamId}-M0${idx + 1}`,
        name: m.name,
        isCaptain: idx === 0,
        rollNo: m.rollNo,
        phone: m.phone,
        email: m.email,
        college: m.college
      }));

      teamsResult.push({
        id: teamId,
        name: teamName,
        size: teamMembers.length,
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
      });

      teamCounter++;
    }
  }

  return teamsResult;
}
