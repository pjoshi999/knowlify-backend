import {
  createDatabasePool,
  query,
  closeDatabasePool,
  isDatabaseReady,
} from "../src/infrastructure/database/pool.js";
import { config } from "../src/shared/config.js";
import * as fs from "fs";
import * as path from "path";

interface InvalidEnrollment {
  enrollment_id: string;
  student_id: string;
  course_id: string;
  payment_id: string;
  enrolled_at: Date;
  course_name: string | null;
}

async function waitForDatabase(maxWaitMs: number = 10000): Promise<void> {
  const startTime = Date.now();
  while (!isDatabaseReady()) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error("Database connection timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function deleteInvalidEnrollments() {
  createDatabasePool({
    connectionString: config.database.url,
    max: config.database.poolMax,
  });

  try {
    console.log("\n🗑️  Deleting Invalid Enrollments...\n");
    console.log("=".repeat(60));

    // Wait for database to be ready
    console.log("⏳ Waiting for database connection...\n");
    await waitForDatabase();
    console.log("✅ Database connected!\n");

    // First, identify what we're about to delete (for logging purposes)
    const identifyQuery = `
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
    `;

    const identifyResult = await query(identifyQuery);
    const invalidEnrollments: InvalidEnrollment[] = identifyResult.rows;

    console.log(`\n📊 Pre-Deletion Analysis:`);
    console.log(
      `   Invalid enrollments to be deleted: ${invalidEnrollments.length}\n`
    );

    if (invalidEnrollments.length === 0) {
      console.log("✅ No invalid enrollments found. Nothing to delete.\n");
      return;
    }

    // Log what will be deleted
    console.log("📋 Enrollments to be deleted:\n");
    invalidEnrollments.forEach((enrollment, index) => {
      console.log(`${index + 1}. Enrollment ID: ${enrollment.enrollment_id}`);
      console.log(`   Student ID (INVALID): ${enrollment.student_id}`);
      console.log(`   Course: ${enrollment.course_name || "N/A"}`);
      console.log("");
    });

    // Save pre-deletion snapshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(process.cwd(), "scripts", "deletion-logs");
    const snapshotFile = path.join(
      outputDir,
      `pre-deletion-snapshot-${timestamp}.json`
    );

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const snapshotData = {
      timestamp: new Date().toISOString(),
      totalToDelete: invalidEnrollments.length,
      enrollments: invalidEnrollments.map((e) => ({
        enrollmentId: e.enrollment_id,
        studentId: e.student_id,
        courseId: e.course_id,
        courseName: e.course_name,
        paymentId: e.payment_id,
        enrolledAt: e.enrolled_at,
      })),
    };

    fs.writeFileSync(snapshotFile, JSON.stringify(snapshotData, null, 2));
    console.log(`💾 Pre-deletion snapshot saved to: ${snapshotFile}\n`);

    // Execute the deletion
    console.log("🔄 Executing deletion...\n");

    const deleteQuery = `
      DELETE FROM enrollments
      WHERE student_id NOT IN (SELECT id FROM users)
      RETURNING id;
    `;

    const deleteResult = await query(deleteQuery);
    const deletedCount = deleteResult.rowCount || 0;

    console.log("=".repeat(60));
    console.log(`\n✅ Deletion Complete!`);
    console.log(`   Records deleted: ${deletedCount}\n`);

    // Verify deletion was successful
    console.log("🔍 Verifying deletion...\n");

    const verifyQuery = `
      SELECT COUNT(*) as remaining_invalid
      FROM enrollments e
      LEFT JOIN users u ON e.student_id = u.id
      WHERE u.id IS NULL;
    `;

    const verifyResult = await query(verifyQuery);
    const remainingInvalid = parseInt(verifyResult.rows[0].remaining_invalid);

    if (remainingInvalid === 0) {
      console.log(
        "✅ Verification successful: No invalid enrollments remain.\n"
      );
    } else {
      console.log(
        `⚠️  Warning: ${remainingInvalid} invalid enrollments still exist.\n`
      );
    }

    // Get final statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_enrollments,
        COUNT(CASE WHEN u.id IS NOT NULL THEN 1 END) as valid_enrollments
      FROM enrollments e
      LEFT JOIN users u ON e.student_id = u.id;
    `;

    const statsResult = await query(statsQuery);
    const stats = statsResult.rows[0];

    console.log("📊 Final Statistics:");
    console.log(`   Total enrollments: ${stats.total_enrollments}`);
    console.log(`   Valid enrollments: ${stats.valid_enrollments}`);
    console.log(`   Invalid enrollments: ${remainingInvalid}\n`);

    // Save deletion log
    const logFile = path.join(outputDir, `deletion-log-${timestamp}.json`);

    const logData = {
      timestamp: new Date().toISOString(),
      deletedCount,
      remainingInvalid,
      finalStats: {
        totalEnrollments: stats.total_enrollments,
        validEnrollments: stats.valid_enrollments,
      },
      snapshotFile,
    };

    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
    console.log(`💾 Deletion log saved to: ${logFile}\n`);
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ Error during deletion:", error);
    throw error;
  } finally {
    await closeDatabasePool();
  }
}

deleteInvalidEnrollments();
