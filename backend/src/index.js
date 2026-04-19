require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { startDecayWorker } = require('./workers/decayWorker');
const errorHandler = require('./middleware/errorHandler');

const companiesRoutes = require('./routes/companies');
const jobsRoutes = require('./routes/jobs');
const applicantsRoutes = require('./routes/applicants');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

// Main Resource Routing
app.use('/api/companies', companiesRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applicants', applicantsRoutes);

// Catch-All Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Pipeline API server running on port ${PORT}`);
  // Launch Decay Worker daemon asynchronously concurrently with server start
  startDecayWorker();
});
