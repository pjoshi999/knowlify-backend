-- Script to verify foreign key constraint on enrollments.student_id
-- Run this in your database SQL editor (e.g., Supabase SQL Editor)

-- Step 1: Check if foreign key constraint exists
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule,
  rc.update_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'enrollments'
  AND kcu.column_name = 'student_id';

-- Step 2: Check for any invalid enrollment data (should return 0 rows after task 3.2)
SELECT e.id, e.student_id, e.course_id, e.enrolled_at
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
WHERE u.id IS NULL;

-- Step 3: Test constraint by attempting to insert invalid data (should fail with error 23503)
-- Uncomment the following line to test (it will fail if constraint is working):
-- INSERT INTO enrollments (student_id, course_id, payment_id) 
-- VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

-- If the constraint doesn't exist, add it with:
-- ALTER TABLE enrollments
-- ADD CONSTRAINT fk_enrollments_student_id
-- FOREIGN KEY (student_id) REFERENCES users(id)
-- ON DELETE CASCADE;
