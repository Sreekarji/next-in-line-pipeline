const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db/pool');
const { exitApplicant } = require('../services/exitService');
const { acknowledgePromotion } = require('../services/acknowledgementService');

// PATCH /api/applicants/:id/exit [auth]
router.patch('/:id/exit', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const verifyRes = await query(`
      SELECT a.id FROM applicants a 
      JOIN job_openings j ON a.job_id = j.id
      WHERE a.id = $1 AND j.company_id = $2
    `, [id, req.company.id]);
    
    if (verifyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    const result = await exitApplicant(id, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/applicants/:id/acknowledge
router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await acknowledgePromotion(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/applicants/:id/status
router.get('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid UUID format for applicant ID.' });
    }
    
    const appRes = await query('SELECT * FROM applicants WHERE id = $1', [id]);
    if (appRes.rows.length === 0) return res.status(404).json({ error: 'Applicant not found' });
    const applicant = appRes.rows[0];

    let applicants_ahead = 0;
    
    if (applicant.status === 'WAITLIST' && applicant.queue_position != null) {
      const aheadRes = await query(`
        SELECT COUNT(*) as count FROM applicants 
        WHERE job_id = $1 AND status = 'WAITLIST' AND queue_position < $2
      `, [applicant.job_id, applicant.queue_position]);
      applicants_ahead = parseInt(aheadRes.rows[0].count, 10);
    }

    res.json({
      status: applicant.status,
      queue_position: applicant.queue_position,
      applicants_ahead,
      decay_deadline: applicant.decay_deadline
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
