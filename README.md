# XcelCrowd Pipeline

## What This Project Does

XcelCrowd Pipeline is a high-precision applicant flow control system built for scalable hiring operations and dynamic PR queueing mechanisms. High-velocity hiring scenarios frequently face issues with simultaneous applications crashing capacities or resulting in unintentional overbookings. Our solution tackles this by providing absolute architectural guarantees over capacity limits, guaranteeing queueing priorities are preserved flawlessly.

This pipeline seamlessly funnels applications via active locking components. Once capacity limits are reached, excess applicants are natively piped onto waitlists. As active applicants are hired or drop out, the system implements an automated waitlist cascade combined with a chronological inactivity decay worker—automatically demoting applicants down the queue with calculated penalty offsets if they fail to actively claim the opening in an allotted timeframe.

## 1. Local Setup & Execution Walkthrough

**1. Prerequisites**
- Node 22+
- PostgreSQL 14+
- Docker and Docker Compose (Recommended for isolated execution)

**2. Complete One-Command Startup**
We have explicitly provisioned a unified bootstrap sequence that automatically aggregates the database, containers, and data modeling scripts.

Run the following inside your terminal:
```bash
./start.sh
```
*Note: This command cleanly executes `docker-compose up -d --build`, provisions the native Postgres bounds, natively sleeps for initialization, and dynamically invokes `node seed.js` straight into the backend daemon.*

**(The terminal will explicitly print out the generated Admin API Key, Job ID, and various Applicant test IDs for you to log in with securely).*

**3. Accessing the Application**
Open your browser and navigate securely to:
👉 **[http://localhost:5173](http://localhost:5173)**

**4. How to Log In & Testing Inject Payload**
- **As a Company:** On the homepage, select the dashboard module. Skip the signup form and enter your explicitly seeded `Job ID` and `Admin API Key` into the **Returning Admin Login** block.
- **As an Applicant:** On the homepage, select the **Candidate Portal**. Enter any `Applicant ID` provided by the seed script.
- **Testing Inject Payloads:** Directly within the Dashboard interface, navigate to the **Inject Data** tab. Enter a test candidate name and mock email. The pipeline natively emits a unique **Generated Reference Key**. Copy this specific UUID directly into the *Candidate Portal* tab to independently monitor live position drops across entirely discrete queues simultaneously!

**10. End-to-End Happy Path Walkthrough**
1. **Create Job:** The Company opens the dashboard and creates a new opening (e.g., "Software Engineer" with capacity 1).
2. **First Applicant Applies:** Applicant A applies and is immediately evaluated as `ACTIVE` (Processing state) because capacity hasn't been met.
3. **Queue Engages:** Applicants B, C, and D apply simultaneously. Since applicant A holds the exclusive lock, B, C, and D are natively bounced into the `WAITLIST` with strict chronologic queue positions.
4. **Applicant Checks Status:** Applicant B opens the candidate portal, enters their ID, and visually watches the glassmorphic UI display "Queue Position: #1".
5. **Applicant Exits:** The Company marks Applicant A as `HIRED` or `REJECTED`, opening up the active slot.
6. **Waitlist Cascade:** The PostgreSQL pipeline automatically triggers the lock for Applicant B, instantly promoting them into `PENDING_ACKNOWLEDGEMENT`.
7. **Acknowledgement:** Applicant B reviews their candidate portal. A countdown timer ring appears natively! They click "Confirm Pipeline Position" to formally accept the job, permanently locking the queue natively before the decay timer drops them.

## Architecture Decisions

1. **Why PERN not MERN:** PostgreSQL row-level locking (`FOR UPDATE`) is strictly essential for executing our capacity-limited concurrency design. MongoDB lacks native synchronous structural locking mechanisms equivalent to `SELECT FOR UPDATE`, which makes preventing race conditions highly complex at scale.
   * **Tradeoff:** Row-level locks inherently block threads database-side, theoretically reducing maximum throughput bursts compared to an asynchronous message broker, though absolutely necessary here for 100% data accuracy.
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
