const { transaction } = require('../db/pool');
const { tryPromote } = require('./promotionService');

async function exitApplicant(applicantId, exitReason) {
  const validReasons = ['WITHDRAWN', 'REJECTED', 'HIRED'];
  if (!validReasons.includes(exitReason)) {
    const err = new Error(`Invalid exit reason. Must be one of: ${validReasons.join(', ')}`);
    err.status = 400;
    throw err;
  }

  return transaction(async (client) => {
    // 1. SELECT applicant WHERE id=applicantId AND status=ACTIVE FOR UPDATE
    const appRes = await client.query(`
      SELECT * FROM applicants 
      WHERE id = $1 AND status = 'ACTIVE' 
      FOR UPDATE
    `, [applicantId]);

    // 2. Throw 409 if not ACTIVE
    if (appRes.rows.length === 0) {
      const err = new Error('Applicant is not ACTIVE or does not exist');
      err.status = 409;
      throw err;
    }
    const applicant = appRes.rows[0];

    // 3. Update applicant status to exitReason value
    const updateRes = await client.query(`
      UPDATE applicants
      SET status = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [applicant.id, exitReason]);
    const exitedApplicant = updateRes.rows[0];

    // 4. Log to pipeline_events: ACTIVE->exitReason
    await client.query(`
      INSERT INTO pipeline_events (applicant_id, job_id, from_status, to_status, reason)
      VALUES ($1, $2, 'ACTIVE', $3, 'APPLICANT_EXITED')
    `, [applicant.id, applicant.job_id, exitReason]);

    // 5. Call promotionService.tryPromote(applicant.job_id) WITHIN the same transaction
    // Supplying client integrates tryPromote into this exact transaction block
    const promotedApplicant = await tryPromote(applicant.job_id, client);

    // 6. Return { exitedApplicant, promotedApplicant }
    return {
      exitedApplicant,
      promotedApplicant
    };
  });
}

module.exports = { exitApplicant };
