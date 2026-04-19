const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { query } = require('../db/pool');
const { submitApplication } = require('../services/applicationService');

// POST /api/jobs [auth]
router.post('/', auth, async (req, res, next) => {
  try {
    const { title, description, active_capacity, ack_window_mins, penalty_offset } = req.body;
    const activeCapacity = active_capacity == null ? 1 : active_capacity;

    const { rows } = await query(`
      INSERT INTO job_openings (company_id, title, description, active_capacity, ack_window_mins, penalty_offset)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [req.company.id, title, description, activeCapacity, ack_window_mins || 60, penalty_offset || 5]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id [auth]
router.get('/:id', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const jobRes = await query('SELECT * FROM job_openings WHERE id = $1 AND company_id = $2', [id, req.company.id]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const countsRes = await query(`
      SELECT status, COUNT(*) as count
      FROM applicants
      WHERE job_id = $1
      GROUP BY status
    `, [id]);

    let activeCount = 0, waitlistCount = 0, pendingCount = 0;
    for (const row of countsRes.rows) {
      if (row.status === 'ACTIVE') activeCount = parseInt(row.count, 10);
      else if (row.status === 'WAITLIST') waitlistCount = parseInt(row.count, 10);
      else if (row.status === 'PENDING_ACKNOWLEDGEMENT') pendingCount = parseInt(row.count, 10);
    }

    res.json({
      ...jobRes.rows[0],
      activeCount,
      waitlistCount,
      pendingCount
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/:id/apply 
router.post('/:id/apply', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    
    const result = await submitApplication(id, { name, email });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id/pipeline [auth]
router.get('/:id/pipeline', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const jobRes = await query('SELECT * FROM job_openings WHERE id = $1 AND company_id = $2', [id, req.company.id]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobRes.rows[0];

    const appRes = await query('SELECT * FROM applicants WHERE job_id = $1 ORDER BY queue_position ASC, created_at ASC', [id]);
    
    const payload = { job, active: [], waitlist: [], pending: [] };
    
    for (const app of appRes.rows) {
      if (app.status === 'ACTIVE') payload.active.push(app);
      else if (app.status === 'WAITLIST') payload.waitlist.push(app);
      else if (app.status === 'PENDING_ACKNOWLEDGEMENT') payload.pending.push(app);
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id/events [auth]
router.get('/:id/events', auth, async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const jobRes = await query('SELECT id FROM job_openings WHERE id = $1 AND company_id = $2', [id, req.company.id]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const eventsRes = await query('SELECT * FROM pipeline_events WHERE job_id = $1 ORDER BY created_at ASC', [id]);
    res.json(eventsRes.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
