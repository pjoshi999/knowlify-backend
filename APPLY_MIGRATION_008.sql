-- ============================================================================
-- MIGRATION 008: Make course_id nullable in upload_sessions and transcoding_jobs
-- ============================================================================
-- 
-- INSTRUCTIONS:
-- 1. Open your Supabase dashboard
-- 2. Go to SQL Editor
-- 3. Copy and paste this entire script
-- 4. Click "Run" to execute
--
-- This migration allows uploads to be created without an assigned course,
-- which is useful when uploading videos before the course is fully created.
-- ============================================================================

-- Make course_id nullable in upload_sessions
ALTER TABLE upload_sessions 
    ALTER COLUMN course_id DROP NOT NULL;

-- Make course_id nullable in transcoding_jobs
ALTER TABLE transcoding_jobs 
    ALTER COLUMN course_id DROP NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN upload_sessions.course_id IS 'Course ID - can be NULL for uploads not yet assigned to a course';
COMMENT ON COLUMN transcoding_jobs.course_id IS 'Course ID - can be NULL for jobs not yet assigned to a course';

-- Record this migration in the migrations table
INSERT INTO migrations (id, name, executed_at) 
VALUES (8, 'make_course_id_nullable', NOW())
ON CONFLICT (id) DO NOTHING;

-- Verify the changes
SELECT 
    table_name,
    column_name,
    is_nullable,
    data_type
FROM information_schema.columns
WHERE table_name IN ('upload_sessions', 'transcoding_jobs')
    AND column_name = 'course_id';

-- Expected output:
-- table_name         | column_name | is_nullable | data_type
-- -------------------+-------------+-------------+-----------
-- upload_sessions    | course_id   | YES         | uuid
-- transcoding_jobs   | course_id   | YES         | uuid
