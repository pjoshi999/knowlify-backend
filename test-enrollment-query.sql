-- Test the exact query that the API uses
-- Replace 'YOUR_STUDENT_ID' with: 5de4e9ae-2005-4bc6-b5fd-f50969c25c46

SELECT 
  e.id,
  e.student_id,
  e.course_id,
  e.payment_id,
  e.progress,
  e.enrolled_at,
  e.last_accessed_at,
  e.completed_at,
  c.name as course_name,
  c.thumbnail_url as course_thumbnail_url,
  u.name as instructor_name,
  0 as completion_percentage
FROM enrollments e
JOIN courses c ON e.course_id = c.id
JOIN users u ON c.instructor_id = u.id
WHERE e.student_id = '5de4e9ae-2005-4bc6-b5fd-f50969c25c46'
ORDER BY e.last_accessed_at DESC;

-- Also check if the course and user exist
SELECT 
  e.id as enrollment_id,
  e.student_id,
  e.course_id,
  c.id as course_exists,
  c.name as course_name,
  c.instructor_id,
  u.id as instructor_exists,
  u.name as instructor_name
FROM enrollments e
LEFT JOIN courses c ON e.course_id = c.id
LEFT JOIN users u ON c.instructor_id = u.id
WHERE e.student_id = '5de4e9ae-2005-4bc6-b5fd-f50969c25c46';
