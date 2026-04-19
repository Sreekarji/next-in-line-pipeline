const { transaction } = require('../db/pool');
const { decayApplicant } = require('../workers/decayWorker');

async function acknowledgePromotion(applicantId) {
  return transaction(async (client) => {
    // 1. SELECT applicant FOR UPDATE
    const appRes = await client.query(`
      SELECT * FROM applicants 
      WHERE id = $1 
      FOR UPDATE
    `, [applicantId]);

    if (appRes.rows.length === 0) {
      throw new Error('Applicant not found');
    }
    const applicant = appRes.rows[0];

    // 2. If status !== PENDING_ACKNOWLEDGEMENT: throw 409 'Already processed'
    if (applicant.status !== 'PENDING_ACKNOWLEDGEMENT') {
      const err = new Error('Already processed');
      err.status = 409;
      throw err;
    }

    // 3. If decay_deadline < NOW(): call DecayWorker.decayApplicant() immediately
    if (applicant.decay_deadline && new Date(applicant.decay_deadline) < new Date()) {
      // The edge case is intercepted synchronously - they missed the window prior to 
      // the daemon catching them. Return the mutated object directly back up the payload.
      const decayedApp = await decayApplicant(applicant.id, client);
      return decayedApp;
    }

    // 4. If valid: update status=ACTIVE, decay_deadline=NULL, queue_position=NULL
    const updateRes = await client.query(`
      UPDATE applicants
      SET status = 'ACTIVE',
          decay_deadline = NULL,
          queue_position = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [applicant.id]);
    const updatedApplicant = updateRes.rows[0];

    // 5. Log pipeline_event: PENDING_ACKNOWLEDGEMENT->ACTIVE, reason=ACKNOWLEDGED
    await client.query(`
      INSERT INTO pipeline_events (applicant_id, job_id, from_status, to_status, reason)
      VALUES ($1, $2, 'PENDING_ACKNOWLEDGEMENT', 'ACTIVE', 'ACKNOWLEDGED')
    `, [updatedApplicant.id, updatedApplicant.job_id]);

    // 6. Return updated applicant
    return updatedApplicant;
  });
}

module.exports = { acknowledgePromotion };
