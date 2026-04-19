const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Standard query helper.
 */
const query = (text, params) => {
  return pool.query(text, params);
};

/**
 * Transaction wrapper that handles BEGIN/COMMIT/ROLLBACK.
 * Passes a database client to the callback to accommodate 
 * FOR UPDATE queries and explicit transactional logic.
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  query,
  transaction,
};
