# Invalid Enrollments Diagnostic Results

This directory contains the results of diagnostic scans for invalid enrollment records.

## Purpose

These diagnostic scripts identify enrollment records in the database where the `student_id` field references user IDs that don't exist in the `users` table. This data integrity issue prevents users from accessing courses they've purchased.

## Files

- `invalid-enrollments-*.json` - JSON reports containing details of invalid enrollments found during each diagnostic run

## Report Format

Each JSON report contains:

```json
{
  "timestamp": "ISO 8601 timestamp of when the diagnostic was run",
  "totalInvalidEnrollments": "Number of invalid enrollment records found",
  "invalidEnrollments": [
    {
      "enrollmentId": "UUID of the enrollment record",
      "studentId": "Invalid student_id that doesn't exist in users table",
      "courseId": "UUID of the course",
      "courseName": "Name of the course (if available)",
      "paymentId": "UUID of the associated payment",
      "enrolledAt": "Timestamp when enrollment was created"
    }
  ]
}
```

## Next Steps

1. **Review the results** - Examine the invalid enrollment records to understand the scope of the issue
2. **Verify the data** - Check if these are test records, orphaned data, or legitimate issues
3. **Backup the data** - Ensure you have a database backup before proceeding with cleanup
4. **Run cleanup script** - Execute task 3.2 to delete invalid enrollment records
5. **Verify constraints** - Execute task 3.3 to ensure foreign key constraints are in place

## Related Tasks

- Task 3.1: Create diagnostic script (this task)
- Task 3.2: Delete invalid enrollment records
- Task 3.3: Add or verify foreign key constraint
- Task 3.4: Verify payment webhook uses correct user IDs
