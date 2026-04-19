const { transaction } = require('../db/pool');

async function submitApplication(jobId, { name, email }) {
  return transaction(async (client) => {
    // 1. SELECT job row FOR UPDATE (locks the row)
    const jobRes = await client.query('SELECT active_capacity FROM job_openings WHERE id = $1 FOR UPDATE', [jobId]);
    if (jobRes.rows.length === 0) {
      throw new Error('Job not found');
    }
    const { active_capacity } = jobRes.rows[0];

    // 2. Count active applicants for this job
    const countRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM applicants 
      WHERE job_id = $1 AND status IN ('ACTIVE', 'PENDING_ACKNOWLEDGEMENT')
    `, [jobId]);
    const count = parseInt(countRes.rows[0].count, 10);

    let status;
    let queue_position = null;

    // 3. If count < active_capacity: insert applicant status=ACTIVE, queue_position=NULL
    if (count < active_capacity) {
      status = 'ACTIVE';
    } 
    // 4. Else: insert applicant status=WAITLIST, queue_position = SELECT COALESCE(MAX(queue_position),0)+1 WHERE job_id=X
    else {
      status = 'WAITLIST';
      const queueRes = await client.query(`
        SELECT COALESCE(MAX(queue_position), 0) + 1 as next_pos 
        FROM applicants 
        WHERE job_id = $1
      `, [jobId]);
      queue_position = parseInt(queueRes.rows[0].next_pos, 10);
    }

    const appRes = await client.query(`
      INSERT INTO applicants (job_id, name, email, status, queue_position)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [jobId, name, email, status, queue_position]);
    const applicant = appRes.rows[0];

    // 5. Log to pipeline_events: from_status=NULL, to_status=<assigned>, reason=APPLICATION_SUBMITTED
    await client.query(`
      INSERT INTO pipeline_events (applicant_id, job_id, from_status, to_status, reason)
      VALUES ($1, $2, NULL, $3, 'APPLICATION_SUBMITTED')
    `, [applicant.id, jobId, status]);

    // 6. Return { applicant, status, queue_position }
    return {
      applicant,
      status,
      queue_position
    };
  });
}

module.exports = { submitApplication };
