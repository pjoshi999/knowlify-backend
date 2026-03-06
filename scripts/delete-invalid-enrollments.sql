-- Cleanup Script: Delete Invalid Enrollments
-- Purpose: Remove enrollments with student_id values that don't exist in users table
-- Bug_Condition: invalidStudentIdsExist()
-- Expected_Behavior: Remove all enrollment records that reference non-existent users
-- Preservation: Valid enrollments remain unchanged
-- Requirements: 2.4

-- ============================================================
-- STEP 1: Preview what will be deleted (IMPORTANT: Review before executing deletion)
-- ============================================================
SELECT 
  e.id as enrollment_id,
  e.student_id,
  e.course_id,
  e.payment_id,
  e.enrolled_at,
  c.name as course_name
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
LEFT JOIN courses c ON e.course_id = c.id
WHERE u.id IS NULL
ORDER BY e.enrolled_at DESC;

-- ============================================================
-- STEP 2: Count how many will be deleted
-- ============================================================
SELECT COUNT(*) as records_to_delete
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
WHERE u.id IS NULL;

-- ============================================================
-- STEP 3: Execute deletion (CAUTION: This cannot be undone without a backup)
-- ============================================================
-- Uncomment the following line to execute the deletion:
-- DELETE FROM enrollments
-- WHERE student_id NOT IN (SELECT id FROM users);

-- Alternative deletion query with explicit LEFT JOIN:
-- DELETE FROM enrollments e
-- USING (
--   SELECT e.id
--   FROM enrollments e
--   LEFT JOIN users u ON e.student_id = u.id
--   WHERE u.id IS NULL
-- ) AS invalid
-- WHERE e.id = invalid.id;

-- ============================================================
-- STEP 4: Verify deletion was successful
-- ============================================================
-- Run this after deletion to confirm no invalid enrollments remain:
SELECT COUNT(*) as remaining_invalid_enrollments
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
WHERE u.id IS NULL;

-- ============================================================
-- STEP 5: Final statistics
-- ============================================================
-- Check the final state of the enrollments table:
SELECT 
  'Total Enrollments' as metric,
  COUNT(*) as count
FROM enrollments
UNION ALL
SELECT 
  'Valid Enrollments' as metric,
  COUNT(*) as count
FROM enrollments e
INNER JOIN users u ON e.student_id = u.id
UNION ALL
SELECT 
  'Invalid Enrollments' as metric,
  COUNT(*) as count
FROM enrollments e
LEFT JOIN users u ON e.student_id = u.id
WHERE u.id IS NULL;

-- ============================================================
-- NOTES:
-- ============================================================
-- 1. ALWAYS review STEP 1 results before executing deletion
-- 2. Consider creating a backup of the enrollments table before deletion
-- 3. The TypeScript script (delete-invalid-enrollments.ts) provides automated logging
-- 4. After deletion, proceed to task 3.3 to add foreign key constraint
-- 5. Valid enrollments (where student_id exists in users table) will NOT be affected

