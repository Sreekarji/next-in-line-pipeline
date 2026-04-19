const { query, transaction } = require('../db/pool');
const promotionService = require('../services/promotionService');

async function decayApplicant(applicantId, txClient) {
  // b. SELECT applicant FOR UPDATE (re-verify still PENDING_ACK)
  const appRes = await txClient.query(`
    SELECT * FROM applicants 
    WHERE id = $1 AND status = 'PENDING_ACKNOWLEDGEMENT' 
    FOR UPDATE
  `, [applicantId]);

  if (appRes.rows.length === 0) return null; // Already processed
  const currentApp = appRes.rows[0];

  // c. Get MAX(queue_position) for this job's WAITLIST applicants
  const queueRes = await txClient.query(`
    SELECT COALESCE(MAX(queue_position), 0) as max_pos
    FROM applicants
    WHERE job_id = $1 AND status = 'WAITLIST'
  `, [currentApp.job_id]);
  const maxPos = parseInt(queueRes.rows[0].max_pos, 10);

  // d. new_position = MAX + penalty_offset (from job_openings row)
  const jobRes = await txClient.query(`
    SELECT penalty_offset FROM job_openings WHERE id = $1
  `, [currentApp.job_id]);
  const penaltyOffset = (jobRes.rows.length > 0 && jobRes.rows[0].penalty_offset !== null) 
    ? parseInt(jobRes.rows[0].penalty_offset, 10) 
    : 5;
  const newPosition = maxPos + penaltyOffset;

  // e. Update applicant: status=WAITLIST, queue_position=new_position, decay_deadline=NULL
  const updateRes = await txClient.query(`
    UPDATE applicants
    SET status = 'WAITLIST',
        queue_position = $2,
        decay_deadline = NULL,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [currentApp.id, newPosition]);
  const decayedApp = updateRes.rows[0];

  // f. Log pipeline_event: PENDING_ACKNOWLEDGEMENT->WAITLIST, reason=INACTIVITY_DECAY
  await txClient.query(`
    INSERT INTO pipeline_events (applicant_id, job_id, from_status, to_status, reason, metadata)
    VALUES ($1, $2, 'PENDING_ACKNOWLEDGEMENT', 'WAITLIST', 'INACTIVITY_DECAY', $3)
  `, [currentApp.id, currentApp.job_id, JSON.stringify({
    original_decay_deadline: currentApp.decay_deadline,
    penalized_position: newPosition
  })]);

  // g. Call promotionService.tryPromote(applicant.job_id) inside same transaction
  // Once decayed, they vacate the slot, prompting the NEXT waitlisted person automatically!
  await promotionService.tryPromote(currentApp.job_id, txClient);

  return decayedApp;
}

async function runDecayCycle() {
  try {
    // 1. SELECT all applicants WHERE status=PENDING_ACKNOWLEDGEMENT AND decay_deadline < NOW()
    const res = await query(`
      SELECT id FROM applicants 
      WHERE status = 'PENDING_ACKNOWLEDGEMENT' 
      AND decay_deadline < NOW()
    `);

    // 2. For each expired applicant (loop, handle individually):
    for (const row of res.rows) {
      try {
        // a. Open transaction()
        await transaction(async (client) => {
          // Harden transaction against exhausting locks on massive queues
          await client.query('SET LOCAL statement_timeout = 5000');
          await decayApplicant(row.id, client); // Contains b-h log chains internally
        });
      } catch (err) {
        // 3. Catch and log errors per-applicant without stopping the loop
        console.error(`[Worker Error] Failed decaying applicant ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[Worker Error] Failure during decay cycle read batch:', err);
  }
}

function startDecayWorker() {
  const interval = parseInt(process.env.DECAY_INTERVAL_MS || 30000, 10);
  setInterval(runDecayCycle, interval);
  console.log(`[Worker] Decay cron initialized on a ${interval}ms loop.`);
}

module.exports = {
  startDecayWorker,
  runDecayCycle,
  decayApplicant
};
