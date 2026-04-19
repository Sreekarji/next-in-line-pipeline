CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    api_key UUID UNIQUE DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_openings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),
    title TEXT NOT NULL,
    description TEXT,
    active_capacity INT NOT NULL,
    ack_window_mins INT DEFAULT 60,
    penalty_offset INT DEFAULT 5,
    status TEXT DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES job_openings(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL,
    queue_position INT,
    decay_deadline TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pipeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_id UUID NOT NULL REFERENCES applicants(id),
    job_id UUID NOT NULL REFERENCES job_openings(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applicants_job_id_status ON applicants(job_id, status);
CREATE INDEX IF NOT EXISTS idx_applicants_job_id_queue_position ON applicants(job_id, queue_position);
