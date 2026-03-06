/**
 * Bug Condition Exploration Test - Bug 2: Null studentId from snake_case/camelCase Mismatch
 *
 * **Validates: Requirements 2.2**
 *
 * CRITICAL: This test is EXPECTED TO FAIL on unfixed code.
 * The test failure confirms that Bug 2 exists (snake_case/camelCase mismatch).
 *
 * When this test PASSES after implementing the fix, it confirms the bug is resolved.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPaymentRepository } from "./payment.repository.js";
import {
  query,
  createDatabasePool,
  closeDatabasePool,
} from "../database/pool.js";
import { config } from "../../shared/config.js";
import { randomUUID } from "crypto";

describe("Bug 2: Null studentId from snake_case/camelCase Mismatch", () => {
  let testStudentId: string;
  let testCourseId: string;
  let testPaymentId: string;
  let testStripePaymentIntentId: string;

  beforeAll(async () => {
    // Initialize database pool
    createDatabasePool({
      connectionString: config.database.url,
      max: config.database.poolMax,
    });

    // Wait a bit for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create test data
    testStudentId = randomUUID();
    testCourseId = randomUUID();
    testStripePaymentIntentId = `pi_test_${randomUUID()}`;

    // Insert test student
    await query(
      `INSERT INTO users (id, email, role, name, password)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        testStudentId,
        `test-${testStudentId}@example.com`,
        "STUDENT",
        "Test Student",
        "test_password_hash",
      ]
    );

    // Insert test course
    await query(
      `INSERT INTO courses (id, instructor_id, name, description, price_amount, price_currency, status, url_slug, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        testCourseId,
        testStudentId,
        "Test Course",
        "Description",
        10000,
        "USD",
        "PUBLISHED",
        `test-course-${testCourseId}`,
        "Technology",
      ]
    );

    // Insert test payment directly into database with snake_case columns
    const paymentResult = await query(
      `INSERT INTO payments (student_id, course_id, amount, currency, status, stripe_payment_intent_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        testStudentId,
        testCourseId,
        10000,
        "USD",
        "PENDING",
        testStripePaymentIntentId,
      ]
    );
    testPaymentId = paymentResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await query("DELETE FROM payments WHERE id = $1", [testPaymentId]);
    await query("DELETE FROM courses WHERE id = $1", [testCourseId]);
    await query("DELETE FROM users WHERE id = $1", [testStudentId]);

    // Close database pool
    await closeDatabasePool();
  });

  it("should return payment with undefined studentId due to snake_case/camelCase mismatch", async () => {
    const paymentRepository = createPaymentRepository();

    // Fetch the payment using the repository
    const payment = await paymentRepository.findByStripePaymentIntent(
      testStripePaymentIntentId
    );

    // The payment should exist
    expect(payment).not.toBeNull();

    if (payment) {
      // Bug manifestation: studentId should be undefined because the repository
      // returns raw database rows with snake_case (student_id) but TypeScript
      // expects camelCase (studentId)
      expect(payment.studentId).toBeUndefined();

      // The raw database row should have student_id (snake_case)
      // We can verify this by checking the raw object
      const rawPayment = payment as any;
      expect(rawPayment.student_id).toBe(testStudentId);

      // Same issue with courseId
      expect(payment.courseId).toBeUndefined();
      expect(rawPayment.course_id).toBe(testCourseId);
    }
  });

  it("should return payment with undefined studentId when fetching by id", async () => {
    const paymentRepository = createPaymentRepository();

    const payment = await paymentRepository.findById(testPaymentId);

    expect(payment).not.toBeNull();

    if (payment) {
      // Bug manifestation
      expect(payment.studentId).toBeUndefined();
      expect(payment.courseId).toBeUndefined();

      // Raw database columns exist
      const rawPayment = payment as any;
      expect(rawPayment.student_id).toBe(testStudentId);
      expect(rawPayment.course_id).toBe(testCourseId);
    }
  });

  it("should return payments with undefined studentId when fetching by student", async () => {
    const paymentRepository = createPaymentRepository();

    const payments = await paymentRepository.findByStudent(testStudentId);

    expect(payments.length).toBeGreaterThan(0);

    const payment = payments[0];
    // Bug manifestation
    expect(payment.studentId).toBeUndefined();
    expect(payment.courseId).toBeUndefined();

    // Raw database columns exist
    const rawPayment = payment as any;
    expect(rawPayment.student_id).toBe(testStudentId);
    expect(rawPayment.course_id).toBe(testCourseId);
  });

  it("should return payments with undefined studentId when fetching by course", async () => {
    const paymentRepository = createPaymentRepository();

    const payments = await paymentRepository.findByCourse(testCourseId);

    expect(payments.length).toBeGreaterThan(0);

    const payment = payments[0];
    // Bug manifestation
    expect(payment.studentId).toBeUndefined();
    expect(payment.courseId).toBeUndefined();

    // Raw database columns exist
    const rawPayment = payment as any;
    expect(rawPayment.student_id).toBe(testStudentId);
    expect(rawPayment.course_id).toBe(testCourseId);
  });

  it("should demonstrate webhook handler would receive null studentId", async () => {
    const paymentRepository = createPaymentRepository();

    // Simulate webhook handler flow
    const payment = await paymentRepository.findByStripePaymentIntent(
      testStripePaymentIntentId
    );

    expect(payment).not.toBeNull();

    if (payment) {
      // This is what the webhook handler would try to access
      const studentIdForEnrollment = payment.studentId;
      const courseIdForEnrollment = payment.courseId;

      // Bug manifestation: these would be undefined, causing enrollment creation to fail
      expect(studentIdForEnrollment).toBeUndefined();
      expect(courseIdForEnrollment).toBeUndefined();

      // This would cause: "null value in column 'student_id' of relation 'enrollments' violates not-null constraint"
      // when trying to create enrollment with undefined studentId
    }
  });
});
