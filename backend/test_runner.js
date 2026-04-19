const { Pool } = require('pg');
const { transaction } = require('./src/db/pool');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function apiCall(method, path, body = null, headers = {}) {
  const url = `http://localhost:3000/api${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined
  };
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let COMPANY_KEY = null;
let JOB_ID = null;

async function runTests() {
  console.log("=== PHASE 1: Schema & Connection Pool ===");
  try {
    let tRes = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = tRes.rows.map(r => r.table_name);
    console.log("[1-2] Tables exist:", ['companies', 'job_openings', 'applicants', 'pipeline_events'].every(t => tables.includes(t)));

    let nullRes = await pool.query(`SELECT is_nullable FROM information_schema.columns WHERE table_name = 'applicants' AND column_name = 'queue_position'`);
    console.log("[3] queue_position nullable:", nullRes.rows[0]?.is_nullable === 'YES');

    let idxRes = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'applicants'`);
    const indexes = idxRes.rows.map(r => r.indexname);
    console.log("[4] Check indexes:", indexes.includes('idx_applicants_job_id_status') && indexes.includes('idx_applicants_job_id_queue_position'));

    let trigRes = await pool.query(`SELECT * FROM information_schema.triggers WHERE event_object_table='pipeline_events'`);
    console.log("[5] pipeline_events triggers:", trigRes.rows.length === 0 ? "Zero (Correct)" : trigRes.rows.length);

    await transaction(async c => {
      await c.query("INSERT INTO companies(id, name, api_key) VALUES(gen_random_uuid(), 'testrollback', gen_random_uuid())");
      throw new Error('forced');
    }).catch(() => {});
    let rbRes = await pool.query(`SELECT count(*) FROM companies WHERE name='testrollback'`);
    console.log("[6] Transaction rollback count:", rbRes.rows[0].count === '0' ? "0 (Correct)" : rbRes.rows[0].count);

  } catch (err) {
    console.error("Phase 1 Failed:", err);
  }

  console.log("\n=== PHASE 2: Core Pipeline Services ===");
  try {
    let corpReq = await apiCall('POST', '/companies', { name: 'TestCoVerification' });
    COMPANY_KEY = corpReq.data.api_key;
    console.log("[7] Created Company, API Key:", COMPANY_KEY);

    let jobReq = await apiCall('POST', '/jobs', { title: 'Test Role', description: 'Test', active_capacity: 2, ack_window_mins: 60, penalty_offset: 5 }, { 'x-api-key': COMPANY_KEY });
    JOB_ID = jobReq.data.id;
    console.log("[7] Created Job, ID:", JOB_ID);

    let alice = await apiCall('POST', `/jobs/${JOB_ID}/apply`, { name: 'Alice', email: 'a@test.com' });
    let bob = await apiCall('POST', `/jobs/${JOB_ID}/apply`, { name: 'Bob', email: 'b@test.com' });
    let carol = await apiCall('POST', `/jobs/${JOB_ID}/apply`, { name: 'Carol', email: 'c@test.com' });
    
    console.log("[8] Statuses:", "Alice:", alice.data.status, "| Bob:", bob.data.status, "| Carol:", carol.data.status, "Queue:", carol.data.queue_position);

    let peRes = await pool.query(`SELECT reason, from_status, to_status FROM pipeline_events WHERE job_id=$1 ORDER BY created_at`, [JOB_ID]);
    console.log("[9] Events logged:", peRes.rows.length);

    await apiCall('PATCH', `/applicants/${alice.data.applicant.id}/exit`, { reason: 'WITHDRAWN' }, { 'x-api-key': COMPANY_KEY });
    let carolStatus = await apiCall('GET', `/applicants/${carol.data.applicant.id}/status`);
    console.log("[10] After exit, Carol status:", carolStatus.data.status);

    await Promise.all([
      apiCall('POST', `/jobs/${JOB_ID}/apply`, { name: 'Dave', email: 'd@test.com' }),
      apiCall('POST', `/jobs/${JOB_ID}/apply`, { name: 'Eve', email: 'e@test.com' })
    ]).then(results => {
       const [dave, eve] = results;
       console.log("[12] Simultaneous applicants got separate statuses?", dave.data.status !== eve.data.status);
    });

  } catch(err) {
    console.error("Phase 2 Failed:", err);
  }
  
  process.exit(0);
}
runTests();
