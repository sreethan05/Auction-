-- =====================================================================
-- THE BID TO WIN — PostgreSQL / Supabase Schema
-- Two-part platform: admin site + participant site, offline bidding,
-- server-timed effects, full audit trail.
-- Apply in Supabase SQL Editor, then set .env and run `npm run seed:supabase`.
-- =====================================================================

-- 1. TEAMS (1,000 coins start, login code, single active session) ----------
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(20) NOT NULL DEFAULT 'QUBIT1',
    active_session_member VARCHAR(50) DEFAULT NULL,
    active_session_at TIMESTAMPTZ DEFAULT NULL,
    score INT DEFAULT 0,
    balance INT DEFAULT 1000,
    wrong_attempts INT DEFAULT 0,
    last_solve_at TIMESTAMPTZ DEFAULT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    lock_reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. MEMBERS (1–3 per team, one captain) ------------------------------------
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    member_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT '',
    roll_no VARCHAR(100) DEFAULT '',
    phone VARCHAR(50) DEFAULT '',
    college VARCHAR(255) DEFAULT '',
    is_captain BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_name, member_id)
);
-- Legacy alias kept by the original schema:
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    member_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) DEFAULT '',
    roll_no VARCHAR(100) DEFAULT '',
    phone VARCHAR(50) DEFAULT '',
    college VARCHAR(255) DEFAULT '',
    is_captain BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_name, member_id)
);

-- 3. PROBLEMS (custom points, sample I/O, hint text per problem) ------------
CREATE TABLE IF NOT EXISTS problems (
    id VARCHAR(10) PRIMARY KEY,
    key VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    constraints TEXT NOT NULL DEFAULT '',
    difficulty VARCHAR(20) NOT NULL DEFAULT 'Easy',
    diff VARCHAR(20) NOT NULL DEFAULT 'Easy',
    category VARCHAR(100) NOT NULL DEFAULT 'Algorithms',
    cat VARCHAR(100) NOT NULL DEFAULT 'Algorithms',
    points INT NOT NULL DEFAULT 200,
    pts INT NOT NULL DEFAULT 200,
    sample_input TEXT NOT NULL DEFAULT '',
    sample_output TEXT NOT NULL DEFAULT '',
    si TEXT NOT NULL DEFAULT '',
    so TEXT NOT NULL DEFAULT '',
    hint_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TEST CASES (sample + extra + hidden; hidden never sent to clients) -----
CREATE TABLE IF NOT EXISTS test_cases (
    id SERIAL PRIMARY KEY,
    problem_id VARCHAR(10) REFERENCES problems(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL DEFAULT 'hidden',
    input_data TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    test_order INT DEFAULT 1
);
CREATE TABLE IF NOT EXISTS hidden_tests (
    id SERIAL PRIMARY KEY,
    problem_id VARCHAR(10) REFERENCES problems(id) ON DELETE CASCADE,
    input_data TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    test_order INT DEFAULT 1
);

-- 5. PINS (one PIN per problem; admin releases to winning team) -------------
CREATE TABLE IF NOT EXISTS pins (
    problem_id VARCHAR(10) PRIMARY KEY REFERENCES problems(id) ON DELETE CASCADE,
    pin VARCHAR(20) NOT NULL,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    released_to VARCHAR(100) DEFAULT NULL
);

-- 6. UNLOCKS (problem unlocked for that team only) ---------------------------
CREATE TABLE IF NOT EXISTS unlocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name VARCHAR(100) NOT NULL,
    problem_id VARCHAR(10) REFERENCES problems(id) ON DELETE CASCADE,
    bid_price INT DEFAULT 0,
    unlocked_by VARCHAR(50) DEFAULT 'ADMIN',
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_name, problem_id)
);
CREATE TABLE IF NOT EXISTS team_unlocked_problems (
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    problem_id VARCHAR(10) REFERENCES problems(id) ON DELETE CASCADE,
    bid_price INT DEFAULT 0,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_id, problem_id)
);

-- 7. SUBMISSIONS (stored permanently: code, language, verdicts, penalty) ----
CREATE TABLE IF NOT EXISTS submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name VARCHAR(100) NOT NULL,
    member_id VARCHAR(50) DEFAULT '',
    member_name VARCHAR(255) DEFAULT '',
    problem_id VARCHAR(10) NOT NULL,
    problem_title VARCHAR(255) DEFAULT '',
    lang VARCHAR(20) NOT NULL,
    code TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'QUEUED',
    verdict VARCHAR(30) DEFAULT 'QUEUED',
    passed BOOLEAN DEFAULT FALSE,
    tests_passed INT DEFAULT 0,
    tests_total INT DEFAULT 0,
    penalty INT DEFAULT 0,
    points_awarded INT DEFAULT 0,
    details TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. COIN TRANSACTIONS (every bid, adjustment, heist; undo tracked) ---------
CREATE TABLE IF NOT EXISTS coin_transactions (
    id TEXT PRIMARY KEY,
    type VARCHAR(40) NOT NULL DEFAULT 'PROBLEM_BID',
    team_name VARCHAR(100) NOT NULL,
    target_team VARCHAR(100) DEFAULT NULL,
    item TEXT DEFAULT '',
    problem_id VARCHAR(10) DEFAULT NULL,
    card_id VARCHAR(30) DEFAULT NULL,
    amount INT NOT NULL DEFAULT 0,
    previous_balance INT DEFAULT 1000,
    remaining_balance INT DEFAULT 1000,
    recorded_by VARCHAR(100) DEFAULT 'ADMIN',
    reason TEXT DEFAULT '',
    undone BOOLEAN DEFAULT FALSE,
    undone_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. WILD CARDS (catalog: exactly ONE copy each; enable/disable) ------------
CREATE TABLE IF NOT EXISTS wild_cards (
    id VARCHAR(30) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'ATTACK',
    duration_min INT DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    owner_team VARCHAR(100) DEFAULT NULL,
    bid_amount INT DEFAULT NULL,
    sold_at TIMESTAMPTZ DEFAULT NULL
);

-- 10. CARD OWNERSHIP (which team holds which single-copy card) --------------
CREATE TABLE IF NOT EXISTS card_ownership (
    card_id VARCHAR(30) REFERENCES wild_cards(id) ON DELETE CASCADE,
    team_name VARCHAR(100) NOT NULL,
    bid_amount INT DEFAULT 0,
    owned_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (card_id)
);

-- 11. CARD ACTIVATIONS (attacks with start/end/target/status; arms; blocks) --
CREATE TABLE IF NOT EXISTS card_activations (
    id TEXT PRIMARY KEY,
    card_id VARCHAR(30) NOT NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'ACTIVATE',
    by_team VARCHAR(100) DEFAULT NULL,
    target_team VARCHAR(100) DEFAULT NULL,
    problem_id VARCHAR(10) DEFAULT NULL,
    coins INT DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ DEFAULT NULL,
    recorded_by VARCHAR(100) DEFAULT 'ADMIN',
    details TEXT DEFAULT ''
);

-- 12. ADMIN USERS (separate login, protected routes) -------------------------
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) DEFAULT 'HEAD_ADMINISTRATOR',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. EVENT SETTINGS (server clock; leaderboard freeze; wild card cutoff) ----
CREATE TABLE IF NOT EXISTS event_settings (
    id INT PRIMARY KEY DEFAULT 1,
    start_at BIGINT DEFAULT NULL,
    end_at BIGINT DEFAULT NULL,
    wildcards_override BOOLEAN DEFAULT FALSE,
    leaderboard_frozen BOOLEAN DEFAULT FALSE,
    leaderboard_snapshot JSONB DEFAULT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- 14. AUDIT LOG (all admin edits, overrides, undos) --------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    admin_id VARCHAR(100) DEFAULT 'ADMIN',
    action VARCHAR(60) NOT NULL,
    target_type VARCHAR(30) DEFAULT '',
    target_id VARCHAR(100) DEFAULT '',
    details TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS telemetry_events (
    id BIGSERIAL PRIMARY KEY,
    team_name VARCHAR(100) NOT NULL,
    member_id VARCHAR(50) DEFAULT '',
    event VARCHAR(50) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes (college lab networks + 500 concurrent users) ---------
CREATE INDEX IF NOT EXISTS idx_members_team ON members(team_name);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_name);
CREATE INDEX IF NOT EXISTS idx_team_members_roll ON team_members(roll_no);
CREATE INDEX IF NOT EXISTS idx_test_cases_problem ON test_cases(problem_id);
CREATE INDEX IF NOT EXISTS idx_hidden_tests_problem ON hidden_tests(problem_id);
CREATE INDEX IF NOT EXISTS idx_unlocks_team ON unlocks(team_name);
CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions(team_name);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_txn_team ON coin_transactions(team_name);
CREATE INDEX IF NOT EXISTS idx_card_act_status ON card_activations(status);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_team ON telemetry_events(team_name);
CREATE INDEX IF NOT EXISTS idx_telemetry_created_at ON telemetry_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teams_score ON teams(score DESC, wrong_attempts ASC);
