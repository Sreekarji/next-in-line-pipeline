require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'src/db/migrations/001_init.sql'), 'utf8');
    await pool.query(sql);
    console.log('Migration successful!');
    process.exit(0);
  } catch(e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
}
run();
