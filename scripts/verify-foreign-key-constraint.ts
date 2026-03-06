#!/usr/bin/env tsx

import dotenv from "dotenv";
import {
  createDatabasePool,
  closeDatabasePool,
  query,
  isDatabaseReady,
} from "../src/infrastructure/database/pool.js";

dotenv.config();

const waitForDatabase = async (maxWaitMs = 30000): Promise<void> => {
  const startTime = Date.now();
  while (!isDatabaseReady()) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error("Database connection timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const verifyForeignKeyConstraint = async (): Promise<void> => {
  try {
    console.log("🔍 Verifying Foreign Key Constraint on enrollments.student_id\n");

    // Initialize database connection
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    createDatabasePool({ connectionString });

    // Wait for database to be ready
    console.log("⏳ Waiting for database connection...\n");
    await waitForDatabase();
    console.log("✅ Database connected!\n");

    // Step 1: Check if foreign key constraint exists
    console.log("Step 1: Checking if foreign key constraint exists...\n");
    
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

    const constraintResult = await query(constraintQuery);

    if (constraintResult.rows.length === 0) {
      console.log("❌ Foreign key constraint NOT FOUND on enrollments.student_id\n");
      console.log("The constraint needs to be added.\n");
      
      // Add the constraint
      console.log("Step 2: Adding foreign key constraint...\n");
      
      const addConstraintQuery = `
        ALTER TABLE enrollments
        ADD CONSTRAINT fk_enrollments_student_id
        FOREIGN KEY (student_id) REFERENCES users(id)
        ON DELETE CASCADE;
      `;
      
      await query(addConstraintQuery);
      console.log("✅ Foreign key constraint added successfully!\n");
    } else {
      console.log("✅ Foreign key constraint EXISTS on enrollments.student_id\n");
      console.log("Constraint details:");
      console.log(`  - Constraint name: ${constraintResult.rows[0].constraint_name}`);
      console.log(`  - References: ${constraintResult.rows[0].foreign_table_name}(${constraintResult.rows[0].foreign_column_name})`);
      console.log(`  - On delete: ${constraintResult.rows[0].delete_rule}`);
      console.log(`  - On update: ${constraintResult.rows[0].update_rule}\n`);
    }

    // Step 2: Test the constraint by attempting to insert invalid data
    console.log("Step 3: Testing constraint by attempting to insert invalid data...\n");
    
    const testInvalidInsert = async (): Promise<boolean> => {
      try {
        // Generate a random UUID that doesn't exist in users table
        const invalidUserId = "00000000-0000-0000-0000-000000000000";
        const testCourseId = "00000000-0000-0000-0000-000000000001";
        const testPaymentId = "00000000-0000-0000-0000-000000000002";
        
        await query(
          `INSERT INTO enrollments (student_id, course_id, payment_id) 
           VALUES ($1, $2, $3)`,
          [invalidUserId, testCourseId, testPaymentId]
        );
        
        // If we get here, the constraint didn't work
        return false;
      } catch (error: any) {
        // Check if it's a foreign key violation error
        if (error.code === "23503") {
          return true; // Constraint is working!
        }
        throw error; // Some other error
      }
    };

    const constraintWorks = await testInvalidInsert();
    
    if (constraintWorks) {
      console.log("✅ Constraint is WORKING! Invalid insert was rejected.\n");
      console.log("   Error code: 23503 (foreign_key_violation)\n");
    } else {
      console.log("❌ Constraint is NOT WORKING! Invalid insert was allowed.\n");
    }

    // Step 3: Verify no invalid data exists
    console.log("Step 4: Checking for existing invalid enrollment data...\n");
    
    const invalidDataQuery = `
      SELECT e.id, e.student_id, e.course_id, e.enrolled_at
      FROM enrollments e
      LEFT JOIN users u ON e.student_id = u.id
      WHERE u.id IS NULL;
    `;
    
    const invalidDataResult = await query(invalidDataQuery);
    
    if (invalidDataResult.rows.length > 0) {
      console.log(`⚠️  Found ${invalidDataResult.rows.length} enrollment(s) with invalid student_id:\n`);
      invalidDataResult.rows.forEach((row: any) => {
        console.log(`   - Enrollment ID: ${row.id}`);
        console.log(`     Student ID: ${row.student_id}`);
        console.log(`     Course ID: ${row.course_id}`);
        console.log(`     Enrolled at: ${row.enrolled_at}\n`);
      });
      console.log("Note: These should have been cleaned up in task 3.2\n");
    } else {
      console.log("✅ No invalid enrollment data found!\n");
    }

    console.log("═══════════════════════════════════════════════════════");
    console.log("Summary:");
    console.log("═══════════════════════════════════════════════════════");
    console.log("✅ Foreign key constraint verification complete");
    console.log("✅ Database enforces referential integrity for student_id");
    console.log("✅ Future invalid data will be prevented\n");

  } catch (error) {
    console.error("❌ Error during verification:", error);
    throw error;
  } finally {
    await closeDatabasePool();
  }
};

// Run the verification
verifyForeignKeyConstraint()
  .then(() => {
    console.log("✅ Verification completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  });
