import {
  createDatabasePool,
  query,
  closeDatabasePool,
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

async function diagnoseInvalidEnrollments() {
  createDatabasePool({
    connectionString: config.database.url,
    max: config.database.poolMax,
  });

  try {
    console.log("\n🔍 Diagnosing Invalid Enrollments...\n");
    console.log("=".repeat(60));

    // Query to find enrollments with student_id values that don't exist in users table
    const invalidEnrollmentsQuery = `
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

    const result = await query(invalidEnrollmentsQuery);
    const invalidEnrollments: InvalidEnrollment[] = result.rows;

    console.log(`\n📊 Results:`);
    console.log(
      `   Total invalid enrollments found: ${invalidEnrollments.length}\n`
    );

    if (invalidEnrollments.length === 0) {
      console.log(
        "✅ No invalid enrollments found. All student_id values reference valid users.\n"
      );
      return;
    }

    // Display details
    console.log("📋 Invalid Enrollment Details:\n");
    invalidEnrollments.forEach((enrollment, index) => {
      console.log(`${index + 1}. Enrollment ID: ${enrollment.enrollment_id}`);
      console.log(`   Student ID (INVALID): ${enrollment.student_id}`);
      console.log(`   Course ID: ${enrollment.course_id}`);
      console.log(`   Course Name: ${enrollment.course_name || "N/A"}`);
      console.log(`   Payment ID: ${enrollment.payment_id}`);
      console.log(
        `   Enrolled At: ${new Date(enrollment.enrolled_at).toISOString()}`
      );
      console.log("");
    });

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputDir = path.join(process.cwd(), "scripts", "diagnostic-results");
    const outputFile = path.join(
      outputDir,
      `invalid-enrollments-${timestamp}.json`
    );

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const reportData = {
      timestamp: new Date().toISOString(),
      totalInvalidEnrollments: invalidEnrollments.length,
      invalidEnrollments: invalidEnrollments.map((e) => ({
        enrollmentId: e.enrollment_id,
        studentId: e.student_id,
        courseId: e.course_id,
        courseName: e.course_name,
        paymentId: e.payment_id,
        enrolledAt: e.enrolled_at,
      })),
    };

    fs.writeFileSync(outputFile, JSON.stringify(reportData, null, 2));

    console.log("=".repeat(60));
    console.log(`\n💾 Results saved to: ${outputFile}\n`);
    console.log("⚠️  Review the results before proceeding with deletion.\n");
  } catch (error) {
    console.error("❌ Error during diagnosis:", error);
    throw error;
  } finally {
    await closeDatabasePool();
  }
}

diagnoseInvalidEnrollments();
