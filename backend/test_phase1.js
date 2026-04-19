const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verify() {
  try {
    // Check tables
    let res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log("Tables:", res.rows.map(r => r.table_name));

    // Check queue_position nullable
    res = await pool.query(`
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'applicants' AND column_name = 'queue_position'
    `);
    console.log("queue_position is_nullable:", res.rows[0]?.is_nullable);

    // Check indexes
    res = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'applicants'
    `);
    console.log("Applicants Indexes:", res.rows.map(r => r.indexname));

    // Check triggers on pipeline_events
    res = await pool.query(`
      SELECT * 
      FROM information_schema.triggers 
      WHERE event_object_table='pipeline_events'
    `);
    console.log("pipeline_events triggers count:", res.rows.length);

    console.log("✅ Phase 1 Verification Script Complete");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
verify();
