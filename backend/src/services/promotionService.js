const { transaction } = require('../db/pool');

async function _tryPromoteLogic(jobId, client) {
  // Fetch capacity and ack window details without Job-level locks to avoid deadlocks with outer exit transactions 
  const jobRes = await client.query('SELECT active_capacity, ack_window_mins FROM job_openings WHERE id = $1', [jobId]);
  if (jobRes.rows.length === 0) return null;
  const { active_capacity, ack_window_mins } = jobRes.rows[0];

  // 1. Count current ACTIVE + PENDING_ACKNOWLEDGEMENT applicants
  const countRes = await client.query(`
    SELECT COUNT(*) as count 
    FROM applicants 
    WHERE job_id = $1 AND status IN ('ACTIVE', 'PENDING_ACKNOWLEDGEMENT')
  `, [jobId]);
  const count = parseInt(countRes.rows[0].count, 10);

  // 2. If count >= active_capacity: return null (no slot available)
  if (count >= active_capacity) {
    return null;
  }

  // 3. SELECT applicant WHERE status=WAITLIST AND job_id=jobId ORDER BY queue_position ASC LIMIT 1 FOR UPDATE
  const waitlistRes = await client.query(`
    SELECT * FROM applicants
    WHERE job_id = $1 AND status = 'WAITLIST'
    ORDER BY queue_position ASC
    LIMIT 1
    FOR UPDATE
  `, [jobId]);

  // 4. If none found: return null
  if (waitlistRes.rows.length === 0) {
    return null;
  }
  const applicant = waitlistRes.rows[0];

  // 5. Update applicant: status=PENDING_ACKNOWLEDGEMENT, queue_position=NULL, decay_deadline=NOW()+ack_window_mins interval
  const updateRes = await client.query(`
    UPDATE applicants
    SET status = 'PENDING_ACKNOWLEDGEMENT',
        queue_position = NULL,
        decay_deadline = NOW() + ($2 || ' minutes')::interval,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [applicant.id, ack_window_mins]);
  const promotedApplicant = updateRes.rows[0];

  // 6. Log to pipeline_events: WAITLIST->PENDING_ACKNOWLEDGEMENT, reason=AUTO_PROMOTED
  await client.query(`
    INSERT INTO pipeline_events (applicant_id, job_id, from_status, to_status, reason)
    VALUES ($1, $2, 'WAITLIST', 'PENDING_ACKNOWLEDGEMENT', 'AUTO_PROMOTED')
  `, [promotedApplicant.id, jobId]);

  // 7. Return promoted applicant
  return promotedApplicant;
}

/**
 * Ensures tryPromote can either run standalone taking its own transaction OR run 
 * WITHIN an existing overarching transaction block (like from exitService).
 */
async function tryPromote(jobId, txClient = null) {
  if (txClient) {
    return _tryPromoteLogic(jobId, txClient);
  }
  return transaction(async (client) => {
    return _tryPromoteLogic(jobId, client);
  });
}

module.exports = { tryPromote };
