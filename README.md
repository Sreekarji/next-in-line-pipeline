# XcelCrowd Pipeline

## What This Project Does

XcelCrowd Pipeline is a high-precision applicant flow control system built for scalable hiring operations and dynamic PR queueing mechanisms. High-velocity hiring scenarios frequently face issues with simultaneous applications crashing capacities or resulting in unintentional overbookings. Our solution tackles this by providing absolute architectural guarantees over capacity limits, guaranteeing queueing priorities are preserved flawlessly.

This pipeline seamlessly funnels applications via active locking components. Once capacity limits are reached, excess applicants are natively piped onto waitlists. As active applicants are hired or drop out, the system implements an automated waitlist cascade combined with a chronological inactivity decay worker—automatically demoting applicants down the queue with calculated penalty offsets if they fail to actively claim the opening in an allotted timeframe.

## Setup & Run

**Prerequisites:**
- Node 18+
- PostgreSQL 14+

**Installation:**
1. Clone the repository and install all node modules for both layers.
\`\`\`bash
cd xcrowd-pipeline
cd backend && npm install
cd ../frontend && npm install
\`\`\`
2. Configure your environment. Generate a \`.env\` in the \`backend/\` directory referencing \`.env.example\`:
\`\`\`ini
DATABASE_URL=postgres://user:password@localhost:5432/xcrowd_pipeline
PORT=3000
DECAY_INTERVAL_MS=30000
\`\`\`
3. Initialize the PostgreSQL schema natively.
\`\`\`bash
psql xcrowd_pipeline < backend/src/db/migrations/001_init.sql
\`\`\`
4. (Optional) Run the seed script to automatically populate your dashboard with a simulated job opening, 3 active testers, and a cascaded waitlist queue for instant debugging/testing.
\`\`\`bash
cd backend && node seed.js
\`\`\`
5. Run both domains concurrently in dev mode.
\`\`\`bash
# Terminal 1
cd backend && npm run dev
# Terminal 2
cd frontend && npm run dev
\`\`\`

## Architecture Decisions

1. **Why PERN not MERN:** PostgreSQL row-level locking (\`FOR UPDATE\`) is strictly essential for executing our capacity-limited concurrency design. MongoDB lacks native synchronous structural locking mechanisms equivalent to \`SELECT FOR UPDATE\`, which makes preventing race conditions highly complex at scale.
   * **Tradeoff:** Row-level locks inherently block threads database-side, theoretically reducing maximum throughput bursts compared to an asynchronous message broker, though absolutely necessary here for 100% data accuracy.
2. **Why \`setInterval\` not node-cron/Bull:** Zero bloat, zero dependencies, completely auditable. A simple 30s JS interval handles sequential SQL batch updates without overloading infrastructure logic or necessitating a redis cache.
   * **Tradeoff:** A naked \`setInterval\` lacks dead-letter queues or distributed locks. If the backend horizontally scales to multiple pods, workers will probabilistically race against each other necessitating a shared cache state.
3. **Why polling not WebSockets:** Hiring pipelines are not real-time trading systems. Running a \`useEffect\` interval loop pushing to a robust Express backend every 30s is a heavily optimized, highly deliberate, and explicitly documented path to save constant thread states.
   * **Tradeoff:** Polling guarantees up to 29.9 seconds of "stale state" for the end-user and inherently wastes idle networking bandwidth executing empty HTTP requests when no state has actively changed.
4. **Why append-only \`pipeline_events\`:** Eventual consistency modeling. Tracking metrics chronologically ensures that audits, funnel analytics, and debugging flows are directly reconstructable backward across time.
   * **Tradeoff:** Long-term analytics tables unbounded by Time-to-Live (TTL) sweeps can bloat database size infinitely, eventually requiring partition staging or external data warehousing integrations.

## Concurrency Approach

When two simultaneous applications battle for the identical final slot, they both instantiate a Postgres transactional boundary wrapper. Inside, both run \`SELECT FOR UPDATE\` on the specific \`$1\` job ID pulling the precise capacity count. 

PostgreSQL forcibly serializes the process mathematically down to the strict row lock level. 
1. The first acquiring thread grabs the lock, analyzes that \`active_count < capacity\`, executes \`status='ACTIVE'\`, and commits—releasing the lock. 
2. The waiting secondary thread triggers. Now it evaluates \`active_count == capacity\`, naturally blocking the secondary insert and re-routing it natively to \`status='WAITLIST'\`. 

This guarantees absolute data integrity locally in the SQL layer with ZERO application-layer mutexes needed.

## Inactivity Decay Design

We utilize an inactivity decay engine to enforce active applicant engagement over passive ghosting scenarios.
- **Decay Window:** Applicants promoted from WAITLIST to PENDING_ACKNOWLEDGEMENT are stamped with a \`decay_deadline\` (derived from \`job.ack_window_mins\`).
- **Penalty Formula:** If the deadline lapses unacknowledged, they are demoted back to the waitlist and shifted dynamically utilizing a \`job.penalty_offset\` mathematical drop so that waiting, actively engaged users jump over them.
- **Cascade Mechanism:** Instantly after penalizing an inactive user, the service natively loops back up and triggers \`tryPromote\`, bumping the NEXT available waitlisted person chronologically.
- **Worker Interval:** Bootstrapped inside \`index.js\`, the native interval ticks every \`DECAY_INTERVAL_MS\` running non-blocking transaction clusters recursively across expired dates.

## API Reference

| Method | Endpoint | Auth | Request Body | Response Shape |
|---|---|---|---|---|
| POST | \`/api/companies\` | No | \`{ "name": "string" }\` | \`{ "id": "uuid", "api_key": "uuid" }\` |
| POST | \`/api/jobs\` | Yes | \`{ "title": "str", "active_capacity": "int", "ack_window_mins": "int", "penalty_offset": "int", "description": "str" }\` | \`{ "id": "uuid", "company_id": "uuid", ... }\` |
| GET | \`/api/jobs/:id\` | Yes | *None* | \`{ "job": {...}, "activeCount": "int", "waitlistCount": "int", "pendingCount": "int" }\` |
| POST | \`/api/jobs/:id/apply\` | No | \`{ "name": "string", "email": "string" }\` | \`{ "applicant": { "id": "uuid", "job_id": "uuid", ... }, "status": "ACTIVE\\|WAITLIST", "queue_position": "int\\|null" }\` |
| PATCH | \`/api/applicants/:id/exit\` | Yes | \`{ "reason": "WITHDRAWN\\|REJECTED\\|HIRED" }\` | \`{ "exitedApplicant": {...}, "promotedApplicant": {...\\|null} }\` |
| PATCH | \`/api/applicants/:id/acknowledge\` | No | *None* | \`{ "id": "uuid", "status": "ACTIVE", "decay_deadline": null }\` |
| GET | \`/api/applicants/:id/status\` | No | *None* | \`{ "status": "str", "queue_position": "int", "applicants_ahead": "int", "decay_deadline": "timestamp" }\` |
| POST | `/api/companies` | No | `{ "name": "string" }` | `{ "id": "uuid", "api_key": "uuid" }` |
| POST | `/api/jobs` | Yes | `{ "title": "str", "active_capacity": "int", "ack_window_mins": "int", "penalty_offset": "int", "description": "str" }` | `{ "id": "uuid", "company_id": "uuid", ... }` |
| GET | `/api/jobs/:id` | Yes | *None* | `{ "job": {...}, "activeCount": "int", "waitlistCount": "int", "pendingCount": "int" }` |
| POST | `/api/jobs/:id/apply` | No | `{ "name": "string", "email": "string" }` | `{ "applicant": { "id": "uuid", "job_id": "uuid", ... }, "status": "ACTIVE\|WAITLIST", "queue_position": "int\|null" }` |
| PATCH | `/api/applicants/:id/exit` | Yes | `{ "reason": "WITHDRAWN\|REJECTED\|HIRED" }` | `{ "exitedApplicant": {...}, "promotedApplicant": {...\|null} }` |
| PATCH | `/api/applicants/:id/acknowledge` | No | *None* | `{ "id": "uuid", "status": "ACTIVE", "decay_deadline": null }` |
| GET | `/api/applicants/:id/status` | No | *None* | `{ "status": "str", "queue_position": "int", "applicants_ahead": "int", "decay_deadline": "timestamp" }` |
| GET | `/api/jobs/:id/pipeline` | Yes | *None* | `{ "active": [...], "waitlist": [...], "pending": [...] }` |
| GET | `/api/jobs/:id/events` | Yes | *None* | `[ { "id": "uuid", "from_status": "...", "to_status": "...", "reason": "...", "created_at": "timestamp" }, ... ]` |

## What I Would Change With More Time

- **WebSocket notifications** natively replacing loop timeouts.
- **Email pipelines via SendGrid** directly alerting passive users into `PENDING_ACKNOWLEDGEMENT`.
- **Rate limiting throttles** isolating public ports (`/apply`, `/status`).
- **Transactional outbox abstractions** segregating pure event logging from structural routing operations.

## Hardening & Refactoring Updates (Version X.1)
- **Lock Exhaustion Prevention:** Injected robust `statement_timeout` limits within `decayWorker.js` to avert catastrophic memory deadlocks during massive queue sweeps.
- **Direct Service Seeding:** Re-engineered `seed.js` to bypass HTTP arrays, utilizing direct database queries and synchronous internal service triggers.
- **Modular CSS Extraction:** Segregated a monolithic `index.css` architecture into dynamically scoped React CSS Modules natively bound to `App`, `Dashboard`, and `ApplicantStatus`.
- **API Endpoint Corrections:** Synchronized `ApplicantStatus.jsx` fetch boundaries (`/api/applicants/:id/status`, `.../acknowledge`) against backend structural expectations.
- **Docker Network Resolution:** Updated the local Vite execution proxy to correctly map to the isolated `backend` Docker service instead of `127.0.0.1`.
- **Compose Warning Cleanup:** Obsoleted legacy `version` tags in `docker-compose.yml` to remove deprecation noise.
- **Empty Catch Safeguards:** Appended console logging parameters to formerly empty HTTP try/catch blocks within the frontend director interfaces.
