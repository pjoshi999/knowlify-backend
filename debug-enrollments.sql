-- Debug script to check enrollments and payments

-- 1. Check if there are any enrollments in the database
SELECT 
  e.id as enrollment_id,
  e.student_id,
  e.course_id,
  e.payment_id,
  e.enrolled_at,
  u.email as student_email,
  c.name as course_name
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
LEFT JOIN courses c ON e.course_id = c.id
ORDER BY e.enrolled_at DESC
LIMIT 10;

-- 2. Check recent payments
SELECT 
  p.id as payment_id,
  p.student_id,
  p.course_id,
  p.status,
  p.amount,
  p.created_at,
  p.completed_at,
  u.email as student_email,
  c.name as course_name
FROM payments p
LEFT JOIN users u ON p.student_id = u.id
LEFT JOIN courses c ON p.course_id = c.id
ORDER BY p.created_at DESC
LIMIT 10;

-- 3. Check if there are completed payments without enrollments
SELECT 
  p.id as payment_id,
  p.student_id,
  p.course_id,
  p.status,
  u.email as student_email,
  c.name as course_name,
  CASE 
    WHEN e.id IS NULL THEN 'NO ENROLLMENT'
    ELSE 'HAS ENROLLMENT'
  END as enrollment_status
FROM payments p
LEFT JOIN users u ON p.student_id = u.id
LEFT JOIN courses c ON p.course_id = c.id
LEFT JOIN enrollments e ON e.student_id = p.student_id AND e.course_id = p.course_id
WHERE p.status = 'COMPLETED'
ORDER BY p.created_at DESC
LIMIT 10;

-- 4. Check your specific user's data (replace with your email)
-- SELECT 
--   u.id as user_id,
--   u.email,
--   u.role,
--   COUNT(e.id) as enrollment_count,
--   COUNT(p.id) as payment_count
-- FROM users u
-- LEFT JOIN enrollments e ON e.student_id = u.id
-- LEFT JOIN payments p ON p.student_id = u.id
-- WHERE u.email = 'YOUR_EMAIL_HERE'
-- GROUP BY u.id, u.email, u.role;
