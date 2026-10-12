# 🏆 THE AUCTIONEER: The Bid to Win — Product Requirements & Technical Specification

> **Event:** Qubit Annual Technical Coding Auction  
> **Brand Identity:** **THE AUCTIONEER**  
> **Target Scale:** 500+ Concurrent Contestants (150–250 Teams)  
> **Primary Technology Stack:** React 18, Vite, Node.js, Express, WebSockets, Supabase / PostgreSQL, Sandboxed Multi-Language Compiler Runner  
> **UI Aesthetic:** Modern Light Theme (`#f8fafc` background, `#ffffff` cards, `#0f172a` slate typography, violet-indigo accent `#7c3aed`)

---

## 📌 Executive Summary

**THE AUCTIONEER: The Bid to Win** is an esports-style competitive programming auction event. Teams of 1 to 3 contestants start with a fixed bankroll of **1,000 ByteCoins**. Instead of solving an open problem set, problems and power cards are auctioned off through a live **offline auctioneer**. Teams bid their coins to win exclusive access to DSA problem statements and disruptive tactical wild cards.

Contestants solve unlocked problems in a high-performance **LeetCode / Mentorpick-style browser IDE** supporting Python, Java, C++, and C. The event concludes with a hybrid scoring calculation that rewards correct solutions, penalizes careless submissions, and converts unspent coins into bonus score points.

---

## 1. Core Event Economy & Bidding Model

### 1.1 Team Bankroll
- **Starting Capital:** Every registered team starts with exactly **1,000 ByteCoins**.
- **Team Size:** 1 to 3 members per team (1 designated Team Captain).
- **Shared Team Wallet:** All members of a team share the same 1,000 ByteCoins wallet in real time.

### 1.2 Strictly Offline Bidding Mechanism
- **No In-Browser Bidding:** To maintain high event energy, all bidding is conducted **in-person / verbally** by the stage auctioneer.
- **Admin Bid Settlement:** When an auction hammer falls, the event administrator selects the winning team in the Admin Portal, selects the auctioned item (problem or wild card), and inputs the winning bid amount.
- **Atomic Balance Deduction:**
  1. The system verifies: `team.balance >= bidAmount`.
  2. If insufficient: The bid is rejected with an error alert (`Insufficient ByteCoins`).
  3. If sufficient: The bid amount is immediately deducted from the team's balance.
  4. An immutable audit record is logged: `{ transactionId, teamName, problemId / cardType, price, remainingBalance, timestamp }`.
  5. The unlocked asset is pushed to all members of that team in real time via WebSockets.

---

## 2. Scoring Engine & Point Formula

The competition leaderboard is governed by a transparent mathematical scoring model:

$$\text{Final Score} = \sum(\text{Solved Problem Points}) - \sum(\text{Penalties}) + \text{round}\left(\frac{\text{Remaining ByteCoins}}{10}\right)$$

### 2.1 Problem Difficulty Points
- Admin-configurable point values per problem statement:
  - **Easy:** 100 – 200 points
  - **Medium:** 200 – 300 points
  - **Hard:** 400 – 500 points
- **All-or-Nothing Scoring:** Full points are awarded **only** when a candidate code submission passes **100% of all hidden test cases**.
- **Zero Partial Credit:** If code passes only 3 out of 5 test cases, it receives **0 points**.

### 2.2 Submission Penalties
- **Failed Verification Penalty:** Each failed submission (Wrong Answer, Time Limit Exceeded, Memory Limit Exceeded, Runtime Error) on an unsolved problem deducts **-10 points**.
- **Repeated Attempt Costs:** Each subsequent failed submission on that problem accumulates another **-10 points**.
- **Protection on Solved Problems:** Once a problem has achieved `ACCEPTED` (100% pass), subsequent submissions for that problem do not incur negative penalties.

### 2.3 Leftover Coins Conversion Bonus
- Unspent ByteCoins incentivize strategic bidding:
  $$\text{Coin Bonus} = \text{round}\left(\frac{\text{ByteCoins Left}}{10}\right)$$
- *Example:* A team finishing with 420 ByteCoins receives **+42 bonus points** on the final scoreboard.

---

## 3. Problem Catalog & Unlock Workflow

### 3.1 Initial Problem Lock State
- At competition start, **all 93 DSA problems are locked** for all teams.
- Contestants can view the Problem Title, Category (Arrays, DP, Graphs, etc.), Difficulty tag (Easy, Medium, Hard), and Point value.
- Problem Description, Constraints, Starter Code, and Test Cases are strictly hidden behind the lock barrier until unlocked.

### 3.2 Unlocking Protocols
1. **Admin Direct Unlock (Primary):**
   - Admin executes offline bid entry: selects Team $\to$ selects Problem $\to$ enters Bid Price $\to$ clicks **Authorize Unlock**.
   - Problem unlocks immediately on all screens belonging to that team.
2. **PIN Code Unlock (Self-Service Backup):**
   - Admin can issue a single-use 6-character alpha-numeric PIN code to the winning team.
   - The team inputs the PIN in their workspace modal to unlock the problem independently.

---

## 4. Participant Coding Workspace (LeetCode / Mentorpick Style)

### 4.1 Interface Layout
- **Left Pane — Problem Dossier:**
  - Problem Title, Difficulty Badge, Points Worth.
  - Formatted Description, Input/Output Format Specifications, Numerical Constraints.
  - Collapsible **Sample Test Cases** with explanatory notes.
  - Active team member indicator (e.g. *"Captain Salman is currently editing"*).
- **Right Pane — Multi-Language Code Editor:**
  - Language Selector: **Python 3**, **C (GCC 11)**, **C++ (G++ 17)**, **Java (OpenJDK 17)**.
  - Line numbers gutter, active line highlighting, auto-indentation, and starter templates.
  - Custom Input (`stdin`) text area.
  - Interactive Action Bar: **Run Code** and **Submit Solution**.

### 4.2 "Run Code" Sandbox (Sample & Custom I/O)
- Fast turnaround sandbox execution against sample input or custom user input.
- **Expected Output Comparison:** Displays the program's live standard output (`stdout`) side-by-side with expected sample output (e.g. `print("Hello World")` renders directly in the output console).
- Returns execution time (ms), memory footprint (MB), and compiler/syntax errors.
- **Does not count as a submission** and does not deduct penalties.

### 4.3 "Submit Solution" (Grading & Verification)
- Queues the code in the background execution worker.
- Evaluates against the entire suite of **hidden test cases** (hidden inputs never sent to client).
- **Verdict Types:**
  - `ACCEPTED` (100% test cases passed $\to$ awards problem points).
  - `WRONG_ANSWER` (Output mismatch $\to$ applies -10 penalty).
  - `TIME_LIMIT_EXCEEDED` (Execution $> 3.0$ seconds $\to$ applies -10 penalty).
  - `RUNTIME_ERROR` (Unhandled exception or non-zero exit $\to$ applies -10 penalty).
  - `COMPILATION_ERROR` (Compiler failure $\to$ returns syntax error log).

---

## 5. Tactical Wild Cards & Sabotage Mechanics

Wild cards are auctioned offline as single-copy tactical advantages or opponent disruptions.

| Wild Card | Type | Effect & Operational Rule | Duration |
| :--- | :--- | :--- | :--- |
| **💡 Hint Pass** | Advantage | Reveals an algorithmic hint, data structure recommendation, or time complexity target for an unlocked problem. | Permanent for Problem |
| **⚡ Team Freeze (Sabotage)** | Disruption | Freezes an opponent team's editor. An animated lock overlay prevents coding and testing. Timer runs server-side to prevent reload bypass. | 10 Minutes |
| **🤖 AI Debugger Assistance** | Advantage | Contestants submit failing code to receive an AI-generated explanation of the bug and recommended fix (1 logic or syntax hint). | 1 Bug Analysis |
| **🕶️ Blackout (Blind Coding)** | Disruption | Opponent team's code editor is rendered completely blacked out. Keyboards, mouse, and timer continue running; contestants must code blind. | 5–10 Minutes |
| **🚫 No Backspaces** | Disruption | Intercepts keyboard events on opponent team's editor, blocking the `Backspace` and `Delete` keys. Contestants must use navigation and careful typing. | 10 Minutes |
| **🛡️ Aegis Shield** *(Suggested)* | Defensive | Equips the team with a passive barrier that automatically negates the next incoming Sabotage or Freeze attack. | 1 Attack Block |
| **🪞 Mirror Sabotage** *(Suggested)* | Defensive | Reflects an incoming Freeze or Blackout sabotage directly back onto the attacking team. | 1 Attack Reflection |
| **💼 Bid Insurance** *(Suggested)* | Financial | If an unlocked problem remains unsolved when the event concludes, refunds 50% of the ByteCoins spent to unlock it. | Post-Event |
| **⭐ Double Points** *(Suggested)* | Score Booster | Doubles the points awarded for the very next problem the team solves with 100% passing tests. | Next Solve |

### 5.1 The T-20 Minute Cutoff Rule
- **Strict Lockdown:** Exactly **20 minutes before the end of the competition** (T-20m), all wild card bidding, purchasing, and sabotage activations are permanently disabled.
- Prevents last-minute disruptions from denying teams their final problem submissions.
- Existing active freezes expire normally and cannot be renewed.

---

## 6. Admin Management Portal

The Admin Portal (`#admin`) is password-protected (`Qubit123` / `Abcd.01@#`) and gives organizers complete control:

### 6.1 Team Roster & Google Sheets Importer
- **Live Google Sheet Sync:** Paste any public Google Sheet link (`/spreadsheets/d/.../edit?usp=sharing`). The backend automatically converts it to CSV and parses contestant records.
- **Direct CSV Upload:** Drag-and-drop CSV file containing contestant names, emails, roll numbers, and colleges.
- **Team Grouping Engine:** Automatically groups contestants into teams of 1 to 3 members, auto-generating unique Team IDs, Member IDs, and assigning Captains (👑).

### 6.2 Offline Bid Settlement Terminal
- Dropdown selector for Target Team.
- Dropdown selector for Item (Problem statement or Wild Card).
- Numeric Input for Winning Bid Price.
- One-click confirmation with real-time ByteCoin validation and WebSocket broadcast.

### 6.3 Real-Time Leaderboard & Live Monitoring
- Ranked table showing: Rank, Team Name, Captain, ByteCoin Balance, Solved Count, Wrong Attempts, and Live Points (with coin bonus included).
- Search and sort filters (by Score, Balance, Solved Count, or Name).
- Reset and manual point override controls for emergency dispute resolution.

### 6.4 Hints Dispatch & Sabotage Control
- View all active team freezes with remaining countdown times.
- One-click **Emergency Unfreeze** button to clear accidental or disputed sabotages.
- Manual Hint Dispatcher to push hints directly to specific teams.

### 6.5 Submissions Vault & Faculty Verification
- Complete audit table recording every submission:
  - Team Name & Submitting Member ID
  - Problem ID & Difficulty
  - Programming Language (Python, C, C++, Java)
  - Full Source Code Snapshot
  - Test Case Breakdown & Execution Verdict
  - Timestamp
- One-click **Export to CSV / PDF** for faculty coordinators and external judges to review before announcing official winners.

---

## 7. Security, Anti-Cheat & Proctoring Telemetry

### 7.1 Sandboxed Code Runner
- Submissions run inside isolated child processes with resource constraints:
  - **Execution Timeout:** 3.0 seconds max per test case.
  - **Memory Ceiling:** 256 MB RAM max.
  - **File System Isolation:** Code executed in ephemeral `/tmp` sandboxes, scrubbed immediately after execution.
  - **Security Flags:** Block dangerous system calls and infinite forks (`forkbomb`, process spawning, external socket connections).

### 7.2 Browser Proctoring Telemetry
- **Mandatory Fullscreen Entrance:** Contestants enter through a fullscreen gate modal.
- **Real-Time Violation Tracking:**
  - Tab Switch / Window Blur detection.
  - Fullscreen exit detection.
  - External clipboard paste blocker.
  - DevTools / Inspect Element shortcut interception (`F12`, `Ctrl+Shift+I`).
- **3-Strike Lockout:** After 3 logged violations, the team's workspace is locked with a red security barrier requiring an Organiser PIN or Admin remote unlock.

---

## 8. Database Schema & Data Models

### 8.1 Supabase / PostgreSQL Tables
- `teams`: `id`, `name`, `size`, `captain_id`, `captain_name`, `balance` (default 1000), `score`, `wrong_attempts`, `is_locked`, `frozen_until`.
- `team_members`: `id`, `team_name`, `member_id`, `name`, `is_captain`, `roll_no`, `email`, `college`.
- `problems`: `id`, `title`, `diff`, `pts`, `cat`, `desc`, `con`, `sample_input`, `sample_output`, `orig_key`.
- `hidden_tests`: `id`, `problem_id`, `input`, `expected_output`.
- `team_unlocked_problems`: `id`, `team_name`, `problem_id`, `bid_price`, `unlocked_at`.
- `transactions`: `id`, `team_name`, `type`, `item_id`, `price`, `previous_balance`, `remaining_balance`, `timestamp`.
- `submissions`: `id`, `team_name`, `member_id`, `problem_id`, `lang`, `code`, `verdict`, `passed`, `penalty`, `awarded_points`, `created_at`.
- `telemetry_events`: `id`, `team_name`, `member_id`, `event_type`, `details`, `timestamp`.

### 8.2 JSON Fallback Store
- Mirrors all data models into `backend/data/store.json` using atomic write buffers to guarantee 100% uptime even if cloud database connectivity drops during the event.

---

## 9. Actionable Team Implementation Checklist

### 💻 Frontend Team
- [x] Implement Light Theme design system (`#f8fafc` / `#ffffff` / `#0f172a` / `#7c3aed`).
- [x] Brand strictly as **THE AUCTIONEER** (no legacy name references).
- [x] LeetCode-style split pane layout with line gutter editor and terminal output.
- [x] Sample test runner displaying stdout (`print("Hello World")`).
- [x] Real-time Sabotage Freeze overlay with live countdown.
- [x] Admin Dashboard with Google Sheet importer, offline bid deductions, and live leaderboard.
- [x] Live Leaderboard modal showing Solved, Wrong, Coins, and Live Score.

### ⚙️ Backend Team
- [x] Express REST API & WebSocket server on port `8765`.
- [x] In-memory + atomic JSON fallback store (`backend/database.js`).
- [x] Native multi-language sandboxed runner (`backend/runner.js`) for Python, C, C++, and Java.
- [x] Asynchronous execution queue with concurrency limiting.
- [x] Supabase PostgreSQL sync module (`backend/supabase.js`) and database migration script (`database.sql`).
- [x] Google Sheet live CSV fetch and parser for teams of 1–3 members.
- [x] Full audit log recording all verified code submissions for faculty review.

### 📋 Event Operations Team (Event Day)
- [ ] Prepare Google Sheet of registered participants (Columns: Name, Email, Roll No, College) with sharing set to "Anyone with link can view".
- [ ] Set up Admin Laptop with projector for the Live Leaderboard.
- [ ] Confirm Auctioneer price increments (e.g. minimum 20 ByteCoins step).
- [ ] Test 3 offline problem unlocks and 1 sabotage freeze before letting contestants into the hall.
- [ ] Announce the T-20m Wild Card cutoff to contestants 5 minutes before it takes effect.
- [ ] Export final submissions CSV from Admin Dashboard for faculty verification and prize distribution.
