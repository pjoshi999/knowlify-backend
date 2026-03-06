#!/usr/bin/env tsx

/**
 * Test script for Task 3.3: Verify foreign key constraint on enrollments.student_id
 * 
 * This script:
 * 1. Checks if the foreign key constraint exists
 * 2. Verifies the constraint is working by attempting to insert invalid data
 * 3. Checks for any existing invalid enrollment data
 * 
 * Expected Behavior:
 * - Foreign key constraint should exist on enrollments.student_id
 * - Attempting to insert invalid student_id should fail with error code 23503
 * - No invalid enrollment data should exist (cleaned up in task 3.2)
 */

import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

interface TestResult {
  step: string;
  status: "PASS" | "FAIL" | "INFO";
  message: string;
  details?: any;
}

const results: TestResult[] = [];

const addResult = (step: string, status: "PASS" | "FAIL" | "INFO", message: string, details?: any) => {
  results.push({ step, status, message, details });
};

const printResults = () => {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("Foreign Key Constraint Verification Results");
  console.log("═══════════════════════════════════════════════════════\n");

  results.forEach((result, index) => {
    const icon = result.status === "PASS" ? "✅" : result.status === "FAIL" ? "❌" : "ℹ️";
    console.log(`${icon} Step ${index + 1}: ${result.step}`);
    console.log(`   ${result.message}`);
    if (result.details) {
      console.log(`   Details:`, JSON.stringify(result.details, null, 2));
    }
    console.log();
  });

  const passCount = results.filter(r => r.status === "PASS").length;
  const failCount = results.filter(r => r.status === "FAIL").length;

  console.log("═══════════════════════════════════════════════════════");
  console.log(`Summary: ${passCount} passed, ${failCount} failed`);
  console.log("═══════════════════════════════════════════════════════\n");
};

const testForeignKeyConstraint = async () => {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    addResult("Configuration", "FAIL", "DATABASE_URL environment variable is not set");
    printResults();
    process.exit(1);
  }

  // Create a simple pool with shorter timeout
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Test connection
    console.log("🔍 Testing database connection...\n");
    await pool.query("SELECT 1");
    addResult("Database Connection", "PASS", "Successfully connected to database");

    // Step 1: Check if foreign key constraint exists
    console.log("Step 1: Checking for foreign key constraint...\n");
    
    const constraintQuery = `
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
    `;

    const constraintResult = await pool.query(constraintQuery);

    if (constraintResult.rows.length > 0) {
      const constraint = constraintResult.rows[0];
      addResult(
        "Foreign Key Constraint Exists",
        "PASS",
        `Constraint '${constraint.constraint_name}' exists on enrollments.student_id`,
        {
          constraint_name: constraint.constraint_name,
          references: `${constraint.foreign_table_name}(${constraint.foreign_column_name})`,
          on_delete: constraint.delete_rule,
          on_update: constraint.update_rule,
        }
      );
    } else {
      addResult(
        "Foreign Key Constraint Exists",
        "FAIL",
        "No foreign key constraint found on enrollments.student_id"
      );
    }

    // Step 2: Test constraint by attempting to insert invalid data
    console.log("Step 2: Testing constraint enforcement...\n");
    
    try {
      const invalidUserId = "00000000-0000-0000-0000-000000000000";
      const testCourseId = "00000000-0000-0000-0000-000000000001";
      const testPaymentId = "00000000-0000-0000-0000-000000000002";
      
      await pool.query(
        `INSERT INTO enrollments (student_id, course_id, payment_id) 
         VALUES ($1, $2, $3)`,
        [invalidUserId, testCourseId, testPaymentId]
      );
      
      // If we get here, the constraint didn't work
      addResult(
        "Constraint Enforcement Test",
        "FAIL",
        "Invalid insert was allowed - constraint is not working!"
      );
      
      // Clean up the invalid data we just inserted
      await pool.query(
        `DELETE FROM enrollments WHERE student_id = $1`,
        [invalidUserId]
      );
    } catch (error: any) {
      if (error.code === "23503") {
        addResult(
          "Constraint Enforcement Test",
          "PASS",
          "Invalid insert was correctly rejected with foreign key violation error",
          { error_code: error.code, error_message: error.message }
        );
      } else {
        addResult(
          "Constraint Enforcement Test",
          "FAIL",
          `Unexpected error during insert test: ${error.message}`,
          { error_code: error.code }
        );
      }
    }

    // Step 3: Check for existing invalid enrollment data
    console.log("Step 3: Checking for invalid enrollment data...\n");
    
    const invalidDataQuery = `
      SELECT e.id, e.student_id, e.course_id, e.enrolled_at
      FROM enrollments e
      LEFT JOIN users u ON e.student_id = u.id
      WHERE u.id IS NULL;
    `;
    
    const invalidDataResult = await pool.query(invalidDataQuery);
    
    if (invalidDataResult.rows.length === 0) {
      addResult(
        "Invalid Data Check",
        "PASS",
        "No invalid enrollment data found in database"
      );
    } else {
      addResult(
        "Invalid Data Check",
        "FAIL",
        `Found ${invalidDataResult.rows.length} enrollment(s) with invalid student_id`,
        { invalid_enrollments: invalidDataResult.rows }
      );
    }

    // Step 4: Verify constraint has ON DELETE CASCADE
    console.log("Step 4: Verifying ON DELETE CASCADE behavior...\n");
    
    if (constraintResult.rows.length > 0) {
      const deleteRule = constraintResult.rows[0].delete_rule;
      if (deleteRule === "CASCADE") {
        addResult(
          "ON DELETE CASCADE",
          "PASS",
          "Constraint has ON DELETE CASCADE - enrollments will be deleted when user is deleted"
        );
      } else {
        addResult(
          "ON DELETE CASCADE",
          "INFO",
          `Constraint has ON DELETE ${deleteRule} - may need to update to CASCADE`,
          { current_delete_rule: deleteRule }
        );
      }
    }

  } catch (error: any) {
    console.error("❌ Error during testing:", error.message);
    addResult("Test Execution", "FAIL", `Error: ${error.message}`, { error: error.stack });
  } finally {
    await pool.end();
    printResults();
    
    const hasFailures = results.some(r => r.status === "FAIL");
    process.exit(hasFailures ? 1 : 0);
  }
};

// Run the test
testForeignKeyConstraint();
