const express = require('express');
const { query } = require('../db/pool');
const router = express.Router();

// POST /api/companies
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await query(`
      INSERT INTO companies (name)
      VALUES ($1)
      RETURNING id, api_key
    `, [name]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
