const { query } = require('../db/pool');

async function auth(req, res, next) {
  const apiKey = req.header('x-api-key');
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  try {
    const { rows } = await query('SELECT * FROM companies WHERE api_key = $1', [apiKey]);
    if (rows.length === 0) {
      return res.status(403).json({ error: 'Invalid API key' });
    }
    
    req.company = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = auth;
