const { query, pool } = require('./src/db/pool');
const { submitApplication } = require('./src/services/applicationService');
const { exitApplicant } = require('./src/services/exitService');
require('dotenv').config();

const names = [
  "Alice Smith", "Bob Jones", "Charlie Brown", "Diana Davis", 
  "Ethan Hunt", "Fiona Gallagher", "George Miller", "Hannah Abbott", 
  "Ian Wright", "Julia Roberts", "Kevin Durant", "Liam Neeson", 
  "Mia Wallace", "Noah Carter", "Olivia Pope"
];

async function runSeed() {
  console.log("🌱 Starting Native Seed Script...");

  // 1. Clean DB (optional but helpful for a pristine demo)
  console.log("🧹 Wiping old test data...");
  await query('TRUNCATE pipeline_events, applicants, job_openings, companies CASCADE');

  // 2. Create Company
  console.log("🏢 Creating Demo Company...");
  const compRes = await query(`
    INSERT INTO companies (name)
    VALUES ($1)
    RETURNING id, api_key
  `, ["Acme Corp (Demo)"]);
  const company = compRes.rows[0];
  const apiKey = company.api_key;
  
  // 3. Create Job
  console.log("💼 Creating Target Job Configuration...");
  const jobRes = await query(`
    INSERT INTO job_openings (company_id, title, description, active_capacity, ack_window_mins, penalty_offset)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [company.id, "Senior Backend Architect", "Building autonomous systems for scale.", 3, 1, 5]);
  const job = jobRes.rows[0];

  // 4. Ingest Applicants
  console.log(`👥 Injecting ${names.length} Applicants sequentially...`);
  let applicants = [];
  for (let name of names) {
    const safeName = name.replace(" ", "").toLowerCase();
    const app = await submitApplication(job.id, {
      name: name,
      email: `${safeName}@example.com`
    });
    applicants.push(app.applicant);
  }

  // 5. Trigger an Exit to create a PENDING_ACKNOWLEDGEMENT state
  console.log("🔥 Terminating first applicant to trigger automated pipeline cascade...");
  await exitApplicant(applicants[0].id, 'WITHDRAWN');

  console.log("\n===========================================");
  console.log("✅ SEED COMPLETE! Your Dashboard is ready.");
  console.log("===========================================");
  console.log("Use the following credentials to log in to the React Frontend (http://localhost:5173):");
  console.log(`Job ID: ${job.id}`);
  console.log(`Admin API Key: ${apiKey}`);
  console.log("-------------------------------------------");
  console.log("Applicant IDs for testing the Portal:");
  
  // Get live list to show status accurately
  const listRes = await query('SELECT * FROM applicants WHERE job_id = $1 ORDER BY queue_position ASC, created_at ASC', [job.id]);
  
  const active = listRes.rows.filter(a => a.status === 'ACTIVE');
  const pending = listRes.rows.filter(a => a.status === 'PENDING_ACKNOWLEDGEMENT');
  const waitlist = listRes.rows.filter(a => a.status === 'WAITLIST');
  
  console.log(`-> ACTIVE Applicant: ${active.length > 0 ? active[0].id : 'N/A'}`);
  console.log(`-> PENDING Applicant: ${pending.length > 0 ? pending[0].id : 'N/A'}`);
  console.log(`-> WAITLIST Applicant: ${waitlist.length > 0 ? waitlist[0].id : 'N/A'}`);
  console.log("===========================================\n");

  process.exit(0);
}

runSeed().catch(err => {
  console.error("Seed Failed:", err);
  process.exit(1);
});
