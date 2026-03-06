-- Diagnostic Script: Identify Invalid Enrollments
-- Purpose: Find enrollments with student_id values that don't exist in users table
-- Bug Condition: invalidStudentIdsExist()
-- Expected Behavior: Identify all enrollment records with invalid foreign key references
-- Requirements: 1.3, 2.4

-- ============================================================
-- STEP 1: Count invalid enrollments
-- ============================================================
SELECT COUNT(*) as invalid_enrollment_count
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
WHERE u.id IS NULL;

-- ============================================================
-- STEP 2: Get detailed information about invalid enrollments
-- ============================================================
SELECT 
  e.id as enrollment_id,
  e.student_id,
  e.course_id,
  e.payment_id,
  e.enrolled_at,
  e.last_accessed_at,
  e.completed_at,
  c.name as course_name,
  c.price_amount as course_price,
  p.status as payment_status,
  p.amount as payment_amount
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
LEFT JOIN courses c ON e.course_id = c.id
LEFT JOIN payments p ON e.payment_id = p.id
WHERE u.id IS NULL
ORDER BY e.enrolled_at DESC;

-- ============================================================
-- STEP 3: Check if any payments reference these invalid student_ids
-- ============================================================
SELECT 
  p.id as payment_id,
  p.student_id,
  p.course_id,
  p.status,
  p.amount,
  p.created_at,
  CASE 
    WHEN u.id IS NULL THEN 'INVALID USER'
    ELSE 'VALID USER'
  END as user_status
FROM payments p
LEFT JOIN users u ON p.student_id = u.id
WHERE p.id IN (
  SELECT e.payment_id
  FROM enrollments e
  LEFT JOIN users u ON e.student_id = u.id
  WHERE u.id IS NULL
)
ORDER BY p.created_at DESC;

-- ============================================================
-- STEP 4: Summary statistics
-- ============================================================
SELECT 
  'Total Enrollments' as metric,
  COUNT(*) as count
FROM enrollments
UNION ALL
SELECT 
  'Invalid Enrollments' as metric,
  COUNT(*) as count
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
WHERE u.id IS NULL
UNION ALL
SELECT 
  'Valid Enrollments' as metric,
  COUNT(*) as count
FROM enrollments e
INNER JOIN users u ON e.student_id = u.id;

-- ============================================================
-- NOTES:
-- ============================================================
-- 1. Review the results carefully before proceeding with deletion
-- 2. Save the output of STEP 2 for audit purposes
-- 3. The foreign key constraint should prevent future invalid data
-- 4. If invalid enrollments exist, proceed to task 3.2 for cleanup
