-- Materialized view for course statistics
CREATE MATERIALIZED VIEW course_statistics AS
SELECT 
  c.id as course_id,
  COUNT(DISTINCT e.id) as enrollment_count,
  COALESCE(AVG(r.rating), 0) as avg_rating,
  COUNT(DISTINCT r.id) as review_count,
  COALESCE(SUM(CASE WHEN p.status = 'COMPLETED' THEN p.amount ELSE 0 END), 0) as total_revenue
FROM courses c
LEFT JOIN enrollments e ON c.id = e.course_id
LEFT JOIN reviews r ON c.id = r.course_id
LEFT JOIN payments p ON c.id = p.course_id
WHERE c.deleted_at IS NULL
GROUP BY c.id;

CREATE UNIQUE INDEX idx_course_stats_course_id ON course_statistics(course_id);

-- Function to refresh course statistics
CREATE OR REPLACE FUNCTION refresh_course_statistics()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY course_statistics;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers to refresh materialized view
CREATE TRIGGER refresh_stats_on_enrollment
  AFTER INSERT OR UPDATE OR DELETE ON enrollments
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_course_statistics();

CREATE TRIGGER refresh_stats_on_review
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_course_statistics();

CREATE TRIGGER refresh_stats_on_payment
  AFTER INSERT OR UPDATE ON payments
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_course_statistics();

-- Additional performance indexes
CREATE INDEX idx_payments_completed ON payments(course_id, completed_at) 
  WHERE status = 'COMPLETED';

CREATE INDEX idx_enrollments_active ON enrollments(course_id, enrolled_at DESC) 
  WHERE completed_at IS NULL;

CREATE INDEX idx_reviews_recent ON reviews(course_id, created_at DESC);

-- Composite index for common queries
CREATE INDEX idx_courses_published_category ON courses(category, created_at DESC) 
  WHERE status = 'PUBLISHED' AND deleted_at IS NULL;

CREATE INDEX idx_courses_instructor_status ON courses(instructor_id, status) 
  WHERE deleted_at IS NULL;
