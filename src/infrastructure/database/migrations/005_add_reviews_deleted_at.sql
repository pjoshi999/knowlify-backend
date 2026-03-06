-- Add deleted_at column to reviews table for soft delete support
ALTER TABLE reviews ADD COLUMN deleted_at TIMESTAMP;

-- Add index for efficient queries filtering by deleted_at
CREATE INDEX idx_reviews_deleted_at ON reviews(course_id) WHERE deleted_at IS NULL;
