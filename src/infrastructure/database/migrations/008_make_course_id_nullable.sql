-- Migration: Make course_id nullable in upload_sessions and transcoding_jobs
-- Reason: Allow uploads without an assigned course (e.g., during course creation)
-- Date: 2026-03-08

-- Make course_id nullable in upload_sessions
ALTER TABLE upload_sessions 
    ALTER COLUMN course_id DROP NOT NULL;

-- Make course_id nullable in transcoding_jobs
ALTER TABLE transcoding_jobs 
    ALTER COLUMN course_id DROP NOT NULL;

-- Update the foreign key constraint to allow NULL
-- (The existing constraint already handles this, but we're being explicit)
COMMENT ON COLUMN upload_sessions.course_id IS 'Course ID - can be NULL for uploads not yet assigned to a course';
COMMENT ON COLUMN transcoding_jobs.course_id IS 'Course ID - can be NULL for jobs not yet assigned to a course';
