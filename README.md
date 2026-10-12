# Qubit AntiCheat & Contest Examination Platform 🚀

A scalable, secure, and production-ready online coding examination platform engineered to comfortably support **500+ concurrent contestants** with real-time proctoring, an auction-based problem economy, and automated multi-language code grading.

---

## 📁 Project Directory Structure

```text
AntiCheatSystem/
├── .gitignore                   # Ignores node_modules, build artifacts, OS files
├── README.md                    # Platform documentation & deployment guide
├── database.sql                 # PostgreSQL production schema & performance indexes
├── docker-compose.yml           # Multi-container orchestration (Nginx, API, DB, Redis)
├── nginx.conf                   # Reverse proxy, gzip, WebSocket & submission rate-limiting
├── package.json                 # Root npm scripts (start, build, dev:backend, dev:frontend)
├── qubit-problems.json          # Root mirror of the 93-problem catalog
│
├── frontend/                    # High-Performance React 18 + Vite SPA
│   ├── package.json             # Frontend dependencies (React, Lucide-react, Vite)
│   ├── vite.config.js           # Vite dev proxy configuration (/api & /ws)
│   ├── index.html               # SPA entry point with Google Fonts
│   └── src/
│       ├── main.jsx             # React DOM root mounting
│       ├── index.css            # Cyberpunk dark mode design system & scrollbars
│       ├── App.jsx              # Master application controller & state manager
│       │
│       ├── components/          # Modular React UI Components
│       │   ├── Header.jsx       # Real-time stats, team badge, fullscreen & proctor shortcuts
│       │   ├── ProblemCatalog.jsx # 93-problem auction catalog with 1-click unlock & search
│       │   ├── CodeEditorPane.jsx # Line gutter editor, stdin, live terminal & solution loader
│       │   ├── GateModal.jsx    # Mandatory fullscreen exam entrance modal
│       │   ├── LockOverlay.jsx  # Anti-cheat lockout screen with organiser PIN unlock
│       │   ├── ProctorDashboard.jsx # Real-time judge monitor for 500 teams & remote unlock
│       │   └── LeaderboardModal.jsx # Live ranked scoreboard sorted by points and penalties
│       │
│       ├── hooks/
│       │   └── useAntiCheat.js  # Telemetry hook (fullscreen, blur, tab switch, paste guard)
│       │
│       └── services/
│           └── api.js           # Asynchronous REST & WebSocket client service
│
└── backend/                     # Asynchronous Queue & Sandboxed Execution Server
    ├── package.json             # Express, WebSocket, CORS dependencies
    ├── Dockerfile               # Multi-compiler container (Node.js, GCC, G++, OpenJDK, Python)
    ├── server.js                # Express REST API, static SPA server & WebSocket hub
    ├── database.js              # In-memory + atomic JSON store & flexible problem lookup
    ├── queue.js                 # Concurrency-limited asynchronous submission queue
    ├── runner.js                # Native sandboxed execution engine (Python, C, C++, Java)
    └── data/
        ├── qubit-problems.json  # Master bank of 93 problems (Easy, Medium, Hard)
        └── store.json           # Atomic database store (teams, balances, audit logs)
```

---

## 🌟 Why These Upgrades Were Made

The original single-file prototype (`qubit-auctioneer (2).html`) suffered from critical vulnerabilities and bottlenecks under concurrent load:
1. **Public API Exhaustion**: It relied on calling Wandbox sequentially in browser loops; 500 users submitting code generated ~2,000 requests per burst, leading to immediate rate-limiting and IP bans.
2. **Hidden Test Leakage**: Hidden tests and expected outputs were transmitted directly to the client browser's memory, making cheating trivial via browser DevTools.
3. **Client-Side Anti-Cheat Bypass**: Flags and admin PINs were stored in `localStorage`, which could be altered or bypassed using the browser console.
4. **State Destruction on Reload**: Refreshing the browser wiped out participant scores and solved problems.

---

## 🏗️ System Architecture

```text
                      [ 500 Contestants (React.js SPA) ]
                                      │
                         HTTPS & WebSockets (WSS)
                                      ▼
                      [ Nginx Edge Proxy & Rate Limiter ]
                         (Gzip, Burst Limits, SSL)
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
      [ Express API & Telemetry Hub ]      [ Real-time Proctor Dashboard ]
         (JWT Auth, Telemetry, Logs)           (Live Feed & Remote Unlock)
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
   [ PostgreSQL ]      [ Redis / Async Queue ]
  (Persistent Data)    (Concurrency Limited: 4-8 parallel jobs)
                             │
                             ▼
               [ Sandboxed Multi-Language Runner ]
               (Python, C, C++, Java · 256MB · 3.0s Timeout)
```

---

## 👥 Shared Team Workspace & Collaboration Model

```text
                   TEAM (e.g. SYNORA)
                    │
         ┌──────────┴──────────┐
         │                     │
  SHARED WORKSPACE        TEAM MEMBERS
         │               ┌─────┼─────┐
         │               ↓     ↓     ↓
         │            SYNORA-01  SYNORA-02  SYNORA-03
         │           (Member A) (Member B) (Member C)
    ┌────┼────┬────┐
    ↓    ↓    ↓    ↓
   E1   E2   M1   M2
```

1. **One Team = One Shared Workspace**:
   * Teams register with **1 to 3 members**, nominating a **Team Captain**.
   * Unique Member IDs are generated automatically (e.g., `SYNORA-01`, `SYNORA-02`, `SYNORA-03`).
   * When any member purchases a problem, it immediately unlocks in the shared workspace for all teammates via WebSockets.
   * If a member solves a problem, all members see: `E1 — Two Sum ✅ SOLVED (Solved by SYNORA-01)`.
   * If a member works on a problem, teammates see: `E2 — Palindrome Number 🟡 IN PROGRESS (Worked on by SYNORA-02)`.
   * Individual member actions (submissions, runs, integrity flags) remain strictly attributed to their specific Member ID.

---

## 🔨 Offline Auction Bidding & Budget Deduction Model

1. **Offline Bidding Protocol**:
   * Problem bidding is conducted manually/offline by the organizer in the hall or Discord portal.
   * When a problem auction concludes, the organizer determines the **winning team** and the **final bid amount** (e.g., ₹300).
2. **Winning Bid Unlock**:
   * A member of the winning team clicks **"Enter Winning Bid"** on the problem (or uses Quick Unlock).
   * They enter the agreed winning bid price (₹).
   * The system verifies the team's available balance and deducts the bid amount from their shared ₹1,000 budget:
     $$\text{Remaining Balance} = \text{Current Balance} - \text{Winning Bid Amount}$$
   * The problem is immediately unlocked for all 3 members of the winning team in real time via WebSockets.
3. **Transaction History & Audit**:
   * Every winning bid unlock permanently records:
     * **Team ID**
     * **Problem ID & Title**
     * **Winning Bid Amount (₹)**
     * **Bidder Member ID** (who submitted the bid)
     * **Remaining Balance (₹)**
     * **Timestamp**
4. **Catalog Strategy**:
   * **Distribution**: **71 Easy**, **21 Medium**, and **1 Hard** (total 93 problems).
   * Teams coordinate strategy so as not to exhaust their ₹1,000 budget on Easy problems when Medium and Hard problems carry significantly higher leaderboard value.

---

## ⚡ Key Improvements

### 1. High-Performance React.js Frontend
* **Sub-50ms Initial Load**: Built with **Vite + React 18**, producing optimized, minified, gzip-compressed chunks (`~59 KB` total bundle size).
* **Cyberpunk Exam UI**: Dark mode theme with glowing neon indicators, stat counters, and responsive split-pane layout.
* **Custom Code Editor**:
  * Line number gutter synchronized with scrolling.
  * Tab key support (4-space indentation).
  * Starter templates for **Python 3, C, C++, and Java**.
  * Dynamic execution terminal showing live worker queue progress (`QUEUED` ➔ `RUNNING` ➔ `RESULT`).
  * **⚡ Load Solution Button**: Instant 1-click test solution auto-fill for testing.
  * **🔓 Paste Toggle (Dev / Exam)**: Flexible testing toggle for proctors and contestants.

### 2. Multi-Layer Anti-Cheat Proctoring Engine (`useAntiCheat`)
* **Fullscreen Lockdown**: Automatically prompts for fullscreen and logs any departures.
* **Tab Switch & Focus Detection**: Detects `visibilitychange` and window `blur` events.
* **Shortcut Interceptor**: Blocks `F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`, `Ctrl+S`, `Ctrl+P`.
* **Clipboard & Paste Guard**: Detects and blocks external code insertion while allowing internal copy/paste within the editor.
* **Server-Enforced Lockout**: If a participant accumulates 3 or more violation flags, their screen locks automatically. Resuming requires an admin override or remote unlock from the proctor.

### 3. Server-Side Sandboxed Evaluation & Queueing
* **Hidden Test Isolation**: Hidden test cases and expected outputs are **never sent to the client**.
* **Asynchronous Queue**: Execution requests return immediately with `{ jobId, status: "QUEUED" }`, preventing HTTP worker exhaustion.
* **Strict Sandboxing**:
  * Execution timeout: `3.0 seconds`
  * Process output limit: `64 KB` (prevents memory attacks or infinite print loops)
  * Isolated temporary directories cleaned up automatically after execution.

### 4. Organiser & Proctor Real-Time Dashboard
* Open the dedicated admin portal at **`/admin`** (e.g. `http://<server>:8765/admin`). The participant site has no admin buttons or links — organisers navigate directly.
* **Live Contestant Monitoring**: View all 500 teams, active sessions, and flagged participants in real time.
* **One-Click Remote Unlock**: Proctors can unfreeze a locked participant's station remotely without leaving their desk.
* **Audit Trail**: Detailed timeline of all flagged events per team.
* **Live Leaderboard**: Real-time scoring ranked by points and solve attempts.

---

## 🚀 Quickstart Guide

### Method 1: Local Development

#### 1. Start the Backend API & Runner:
```bash
npm start
```
*The server will start on `http://localhost:8765` and serve both the API and the React build.*

#### 2. (Optional) Run Vite in Development Mode:
```bash
npm run dev:frontend
```
*Open `http://localhost:3000` in your browser.*

---

### Method 2: Multi-Node Docker Deployment (500 Concurrent Users)

To deploy with Nginx, PostgreSQL, Redis, and Sandboxed Workers:

```bash
docker compose up -d --build
```
* Access the contestant portal at `http://localhost`.
* Access the backend directly at `http://localhost:8765`.

---

## 🛡️ Admin Portal & Google Sheet Roster Import

### 1. Admin / Participant Separation
The platform is split into two fully isolated surfaces:
* **Participant site — `/`**: team login, problem catalog, code editor, leaderboard. Contains no admin links.
* **Admin portal — `/admin`**: separate login page and dashboard for organisers.

Server-side enforcement:
* `POST /api/admin/login` validates credentials from `.env` (`ADMIN_ID` / `ADMIN_PASSWORD`) and issues a random 8-hour session token. Failed logins are rate-limited (5 attempts → 5-minute lockout per IP).
* Every other `/api/admin/*` route (and the proctor telemetry channel) requires `Authorization: Bearer <token>`; unauthenticated calls get `401`.
* Admin credentials are **never** shipped to the participant browser, and admin data has no client-side fallbacks — if the API rejects the session, the dashboard returns to the admin login page.
* The only participant-facing organiser action is the emergency **Unlock PIN** on the lock screen (`/api/proctor/unlock`), which is validated server-side against `ORGANISER_PIN`.

### 2. Admin Authentication
Visit `/admin` (e.g. `http://<server>:8765/admin`) and sign in with the Admin ID / Password configured in `.env` (defaults below).

### 2. Google Sheet & CSV Contestant Import
* In the **Teams & Sheet** tab of the Admin Dashboard:
  * **Google Sheet URL Import**: Paste any Google Sheet share link (e.g. `https://docs.google.com/spreadsheets/d/XXXX/edit#gid=0`). The system automatically converts it to CSV export format. Ensure the sheet access is set to *"Anyone with the link can view"*.
  * **CSV Upload or Raw Text**: Upload a `.csv` file or paste raw rows directly.
  * **Team Sizing**: Choose **1, 2, or 3 contestants per team** (defaults to 2).
  * **Automatic Team Pairing**:
    * If the sheet contains a `Team` or `Team Name` column, users are automatically grouped into their designated teams.
    * If no team column is present, contestants are automatically assigned into sequential teams (`TEAM_01`, `TEAM_02`, etc.).

### 3. Interactive Team Inspection
* **Click any Team Card** to expand and reveal all members belonging to that team:
  * **Member Badges**: Distinct indicator for Team Captain (`M01`) vs Teammates (`M02`, `M03`).
  * **Contestant Details**: Full Name, Unique Member ID, College / University, Roll / Register No, Email, and Phone number.
  * **Live Status**: Real-time ByteCoins balance, problems unlocked, problems solved, and active lock status.
  * **Quick Actions**: Jump directly to problem unlock modal for that team or remove team with one click.

---

## 🎯 Event-Day Runbook

### Before the event (T−60 min)
1. `npm run build` then `npm start` — the server serves both sites on one port.
2. Open **`/admin`**, log in, and go to **Teams & Sheet** — import the roster from Google Sheet/CSV or add teams manually (1–3 members each). Every team starts with **1,000 ByteCoins** and is issued a **6-character login code** — click **Show login code** on the team card, print it, and hand it to the team. Use **Edit** to fix rosters (1–3 members) and **Release session** if a team gets stuck on another device.
3. **Event & Ledger** tab → set the **Start** and **End** time. The countdown appears on both sites and the wild-card cutoff (end − 20 min) is computed from it.
4. **Event & Ledger** → click **Freeze Leaderboard** now if you want standings hidden until the event starts; unfreeze at go-time. **Reset Leaderboard** clears scores/penalties/solves (keeps coins & unlocks) if you need a clean restart.
5. **Problems** tab → **Generate Missing PINs**. Optionally edit any problem's **points** (inline field) — defaults are Easy 200 / Medium 300 / Hard 400. Use **+ New Problem** / **Edit** / **Delete** for full problem management (title, description, constraints, difficulty, custom points, sample I/O, hidden tests, hint text).
6. **Wild Cards** tab → review the 16 cards; disable any you don't want (power icon). Each card has exactly **one copy**.

### During the event
| When | What | Where |
|---|---|---|
| A problem auction ends | Record the offline bid: team + problem + coins paid → coins deducted automatically (blocked if insufficient). Hand the winner the problem's **PIN** (click it to copy, then **Release →**). The team enters the PIN to unlock. You can also **Unlock Problem** directly. | Problems tab |
| A wild card auction ends | **Record Offline Wild Card Bid** (card + team + coins). One copy per card — sold cards can't be re-bid. | Wild Cards tab |
| Buyer wants a card used | **Activate** (attack/utility — pick target team/problem/language/amount) or **Arm** (Shield / Mirror / Insurance — declared *before* an attack or submission). Armed cards auto-block the next attack and are consumed. | Wild Cards tab |
| An effect must stop early | **Cancel** on the Active Effects row (logged). | Wild Cards tab |
| Mistake in the ledger | **Undo** on the transaction (refunds the coins); or apply a **Manual Override** (coins/points with a required reason). Everything lands in the **Audit Log**. | Event & Ledger tab |
| Faculty wants evidence | **Export CSV / Export PDF** — submissions (code, language, verdicts, penalties), transactions, teams. | Submissions / Event tabs |
| Last 20 minutes | Wild card bidding, activation, and arming **lock automatically**; both sites show "Wild cards closed". Emergency override is a confirmed, logged action. | Wild Cards tab |

### Scoring (automatic)
Full pass → problem points (once per problem) · failed submission → **−10** · partial → 0 ·
armed Insurance waives one −10 · Double Points doubles one problem ·
**Final score = points − penalties + (remaining coins ÷ 10)** · tie-break: earlier last solve.
Every submission (code, language, timestamp, per-test results, penalty) is stored permanently.

### Participant site (give this to teams)
`http://<server>:8765/` — team name + member + **6-character login code** → workspace (one active session per team; a second device is blocked unless it ticks Force login, which is logged). The home page shows an **Auction Catalog** of all problems in locked form (difficulty + points only) plus **My Problems** unlocked for the team. Problems unlock per-team via **PIN** (rate-limited: 5 wrong attempts → 5-minute lockout) or direct admin unlock. **Run** is unlimited (shows the program's actual stdout beside expected output); **Submit** asks "This is your final submission. Extra attempts cost -10." and grades hidden tests. Live leaderboard (top-right button, coins-left column, Frozen icon, tie-break by earlier solve), wild card inventory, effect banners with countdowns, and the event countdown are all real-time and server-timed — a page refresh never clears a freeze.

---

## 🗄️ Supabase Database Setup


### 1. Set Up PostgreSQL Schema in Supabase
1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** tab.
3. Paste the contents of `database.sql` (found in the root directory) and click **Run**.
4. The following tables will be created:
   * `teams` (login code, single active session, 1,000-coin balance) & `members` / `team_members` (1–3 per team)
   * `problems` (title, description, constraints, difficulty, custom points, sample I/O, hint text) & `test_cases` / `hidden_tests`
   * `pins` (one per problem) & `unlocks` / `team_unlocked_problems` (per-team unlocks)
   * `submissions` (code, language, verdicts, penalties — permanent)
   * `coin_transactions` (bids, adjustments, heists, undos)
   * `wild_cards`, `card_ownership` (single-copy), `card_activations` (attacks with start/end/target/status)
   * `admin_users`, `event_settings` (server clock, leaderboard freeze), `audit_log`, `telemetry_events`

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the root folder and add your Supabase credentials plus the admin credentials:
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=8765
ADMIN_ID=Qubit123
ADMIN_PASSWORD="Abcd.01@#"
ORGANISER_PIN=qubit
```
> Tip: quote values that contain `#` (dotenv treats an unquoted `#` as the start of a comment).

### 3. Seed 93 DSA Problems into Supabase
Run the automated seed script to populate all 93 LeetCode problems with difficulty tiers, base bid prices, sample test cases, and hidden test suites:
```bash
npm run seed:supabase
```

---

## 🔑 Default Credentials

Configured in `.env` (change them before event day):
* **Admin Portal** (`/admin`): `ADMIN_ID` = `Qubit123` / `ADMIN_PASSWORD` = `"Abcd.01@#"`
* **Organiser PIN** (lock-screen emergency unlock): `ORGANISER_PIN` = `qubit`
* **Contestant Team Format**: `TEAM_01`, `TEAM_02`, etc. with members `TEAM_01-M01`, `TEAM_01-M02`
* **Team login codes**: 6-character code per team (shown in Teams & Sheet → **Show login code**); demo teams: `Synora` → `SYNORA1`, `VisionX` → `VISION1` (regenerate any time; regenerating clears the active session)
* **Default Problem Unlock Keys**: Problem IDs (`E1`, `M1`, `H1`), numbers (`1`, `20`), or names (`Two Sum`, `Add Two Numbers`).
