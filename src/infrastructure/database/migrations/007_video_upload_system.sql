-- Migration: Video Upload System Tables
-- Description: Creates tables for scalable video upload system with multipart chunking, deduplication, cost tracking, and monitoring

-- Upload Sessions Table
CREATE TABLE IF NOT EXISTS upload_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instructor_id UUID NOT NULL,
    course_id UUID NOT NULL,
    file_name VARCHAR(1024) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    mime_type VARCHAR(255) NOT NULL,
    checksum VARCHAR(64), -- SHA-256 hash for deduplication
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'failed', 'cancelled')),
    storage_key VARCHAR(1024) NOT NULL,
    upload_id VARCHAR(255) NOT NULL, -- S3 multipart upload ID
    chunk_size INTEGER NOT NULL DEFAULT 104857600, -- 100MB in bytes
    total_chunks INTEGER NOT NULL CHECK (total_chunks > 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, -- For optimistic locking
    CONSTRAINT fk_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Indexes for upload_sessions
CREATE INDEX idx_upload_sessions_instructor_id ON upload_sessions(instructor_id);
CREATE INDEX idx_upload_sessions_course_id ON upload_sessions(course_id);
CREATE INDEX idx_upload_sessions_status ON upload_sessions(status);
CREATE INDEX idx_upload_sessions_created_at ON upload_sessions(created_at);
CREATE INDEX idx_upload_sessions_expires_at ON upload_sessions(expires_at);
CREATE INDEX idx_upload_sessions_checksum ON upload_sessions(checksum) WHERE checksum IS NOT NULL;

-- Upload Chunks Table
CREATE TABLE IF NOT EXISTS upload_chunks (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    chunk_number INTEGER NOT NULL CHECK (chunk_number > 0),
    etag VARCHAR(255) NOT NULL, -- S3 ETag from upload response
    checksum VARCHAR(64) NOT NULL, -- SHA-256 of chunk data
    uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_session FOREIGN KEY (session_id) REFERENCES upload_sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT unique_session_chunk UNIQUE(session_id, chunk_number)
);

-- Indexes for upload_chunks
CREATE INDEX idx_upload_chunks_session_id ON upload_chunks(session_id);
CREATE INDEX idx_upload_chunks_uploaded_at ON upload_chunks(uploaded_at);

-- File Hashes Table (for deduplication)
CREATE TABLE IF NOT EXISTS file_hashes (
    hash VARCHAR(64) PRIMARY KEY, -- SHA-256 hash
    storage_key VARCHAR(1024) NOT NULL, -- Original S3 key
    reference_count INTEGER NOT NULL DEFAULT 1 CHECK (reference_count >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for file_hashes
CREATE INDEX idx_file_hashes_last_accessed ON file_hashes(last_accessed_at);
CREATE INDEX idx_file_hashes_reference_count ON file_hashes(reference_count);

-- Cost Records Table
CREATE TABLE IF NOT EXISTS cost_records (
    id SERIAL PRIMARY KEY,
    instructor_id UUID NOT NULL,
    course_id UUID,
    cost_type VARCHAR(50) NOT NULL CHECK (cost_type IN ('storage', 'bandwidth', 'transcoding')),
    cost_usd DECIMAL(10, 4) NOT NULL CHECK (cost_usd >= 0),
    details JSONB, -- Additional cost breakdown details
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    month VARCHAR(7) NOT NULL, -- YYYY-MM format for aggregation
    CONSTRAINT fk_cost_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cost_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
);

-- Indexes for cost_records
CREATE INDEX idx_cost_records_instructor_id ON cost_records(instructor_id);
CREATE INDEX idx_cost_records_course_id ON cost_records(course_id) WHERE course_id IS NOT NULL;
CREATE INDEX idx_cost_records_cost_type ON cost_records(cost_type);
CREATE INDEX idx_cost_records_month ON cost_records(month);
CREATE INDEX idx_cost_records_recorded_at ON cost_records(recorded_at);

-- Upload Metrics Table
CREATE TABLE IF NOT EXISTS upload_metrics (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    instructor_id UUID NOT NULL,
    instructor_tier VARCHAR(50) NOT NULL CHECK (instructor_tier IN ('premium', 'standard', 'free')),
    region VARCHAR(100), -- Geographic region
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    upload_duration INTEGER, -- Duration in seconds
    average_speed BIGINT, -- Bytes per second
    status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed')),
    failure_reason TEXT,
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_metrics_session FOREIGN KEY (session_id) REFERENCES upload_sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT fk_metrics_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for upload_metrics
CREATE INDEX idx_upload_metrics_session_id ON upload_metrics(session_id);
CREATE INDEX idx_upload_metrics_instructor_id ON upload_metrics(instructor_id);
CREATE INDEX idx_upload_metrics_instructor_tier ON upload_metrics(instructor_tier);
CREATE INDEX idx_upload_metrics_status ON upload_metrics(status);
CREATE INDEX idx_upload_metrics_recorded_at ON upload_metrics(recorded_at);
CREATE INDEX idx_upload_metrics_region ON upload_metrics(region) WHERE region IS NOT NULL;

-- Audit Logs Table (for compliance and security)
CREATE TABLE IF NOT EXISTS upload_audit_logs (
    id SERIAL PRIMARY KEY,
    session_id UUID,
    instructor_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL, -- e.g., 'upload_initiated', 'chunk_uploaded', 'upload_completed', 'upload_cancelled'
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_audit_session FOREIGN KEY (session_id) REFERENCES upload_sessions(session_id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for upload_audit_logs
CREATE INDEX idx_upload_audit_logs_session_id ON upload_audit_logs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_upload_audit_logs_instructor_id ON upload_audit_logs(instructor_id);
CREATE INDEX idx_upload_audit_logs_action ON upload_audit_logs(action);
CREATE INDEX idx_upload_audit_logs_created_at ON upload_audit_logs(created_at);

-- Transcoding Jobs Table
CREATE TABLE IF NOT EXISTS transcoding_jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    instructor_id UUID NOT NULL,
    course_id UUID NOT NULL,
    source_key VARCHAR(1024) NOT NULL, -- S3 key of uploaded video
    priority VARCHAR(50) NOT NULL CHECK (priority IN ('high', 'normal', 'low')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    profiles JSONB NOT NULL, -- Array of quality profiles to generate
    outputs JSONB, -- Array of transcoding outputs
    retry_count INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT fk_transcoding_session FOREIGN KEY (session_id) REFERENCES upload_sessions(session_id) ON DELETE CASCADE,
    CONSTRAINT fk_transcoding_instructor FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_transcoding_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

-- Indexes for transcoding_jobs
CREATE INDEX idx_transcoding_jobs_session_id ON transcoding_jobs(session_id);
CREATE INDEX idx_transcoding_jobs_instructor_id ON transcoding_jobs(instructor_id);
CREATE INDEX idx_transcoding_jobs_course_id ON transcoding_jobs(course_id);
CREATE INDEX idx_transcoding_jobs_status ON transcoding_jobs(status);
CREATE INDEX idx_transcoding_jobs_priority ON transcoding_jobs(priority);
CREATE INDEX idx_transcoding_jobs_created_at ON transcoding_jobs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for upload_sessions updated_at
CREATE TRIGGER update_upload_sessions_updated_at
    BEFORE UPDATE ON upload_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE upload_sessions IS 'Stores video upload session state for multipart uploads with resumability';
COMMENT ON TABLE upload_chunks IS 'Tracks individual chunk uploads for each session';
COMMENT ON TABLE file_hashes IS 'Stores file hashes for deduplication to reduce storage costs';
COMMENT ON TABLE cost_records IS 'Tracks storage, bandwidth, and transcoding costs per instructor and course';
COMMENT ON TABLE upload_metrics IS 'Stores upload performance metrics for monitoring and analytics';
COMMENT ON TABLE upload_audit_logs IS 'Audit trail for all upload operations (1 year retention)';
COMMENT ON TABLE transcoding_jobs IS 'Manages asynchronous video transcoding jobs with retry logic';
