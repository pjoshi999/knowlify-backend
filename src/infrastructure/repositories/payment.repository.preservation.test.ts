/**
 * Preservation Property Tests - Payments
 *
 * **Validates: Requirements 3.4, 3.5**
 *
 * IMPORTANT: These tests run on UNFIXED code and should PASS.
 * They capture baseline behavior for operations that currently work.
 * After implementing fixes, these tests must still PASS (no regressions).
 *
 * Property 4: Preservation - Payment Operations
 * For any payment create, update, or fetch operation that currently works,
 * the fixed code SHALL produce exactly the same behavior.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createPaymentRepository } from "./payment.repository.js";
import {
  query,
  createDatabasePool,
  closeDatabasePool,
} from "../database/pool.js";
import { config } from "../../shared/config.js";
import { randomUUID } from "crypto";
import type { Payment } from "../../domain/types/payment.types.js";

describe("Preservation: Payment Operations", () => {
  let testStudentId: string;
  let testCourseId: string;
  let testInstructorId: string;

  beforeAll(async () => {
    // Initialize database pool
    createDatabasePool({
      connectionString: config.database.url,
      max: config.database.poolMax,
    });

    // Wait for connection to establish
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create test instructor
    testInstructorId = randomUUID();
    await query(
      `INSERT INTO users (id, email, role, name, password)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        testInstructorId,
        `instructor-${testInstructorId}@example.com`,
        "INSTRUCTOR",
        "Test Instructor",
        "test_password_hash",
      ]
    );

    // Create test student
    testStudentId = randomUUID();
    await query(
      `INSERT INTO users (id, email, role, name, password)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        testStudentId,
        `student-${testStudentId}@example.com`,
        "STUDENT",
        "Test Student",
        "test_password_hash",
      ]
    );

    // Create test course
    testCourseId = randomUUID();
    await query(
      `INSERT INTO courses (id, instructor_id, name, description, price_amount, price_currency, status, url_slug, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        testCourseId,
        testInstructorId,
        "Test Course",
        "Test Description",
        10000,
        "USD",
        "PUBLISHED",
        `test-course-${testCourseId}`,
        "Technology",
      ]
    );
  });

  afterAll(async () => {
    // Clean up test data in correct order
    await query("DELETE FROM payments WHERE course_id = $1", [testCourseId]);
    await query("DELETE FROM courses WHERE id = $1", [testCourseId]);
    await query("DELETE FROM users WHERE id IN ($1, $2)", [
      testStudentId,
      testInstructorId,
    ]);

    // Close database pool
    await closeDatabasePool();
  });

  beforeEach(async () => {
    // Clean up any payments from previous tests
    await query("DELETE FROM payments WHERE course_id = $1", [testCourseId]);
  });

  describe("Property: Payment Creation Preservation", () => {
    it("should create a payment with all required fields", async () => {
      const paymentRepository = createPaymentRepository();

      const paymentData: Omit<Payment, "id" | "createdAt"> = {
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
      };

      const payment = await paymentRepository.create(paymentData);

      expect(payment).toBeDefined();
      expect(payment.id).toBeDefined();
      // Database returns snake_case, so check both
      expect(payment.student_id || payment.studentId).toBe(testStudentId);
      expect(payment.course_id || payment.courseId).toBe(testCourseId);
      expect(payment.amount).toBe(10000);
      expect(payment.currency).toBe("USD");
      expect(payment.status).toBe("PENDING");
      expect(
        payment.stripe_payment_intent_id || payment.stripePaymentIntentId
      ).toBe(paymentData.stripePaymentIntentId);
    });

    it("should create a payment with optional fields", async () => {
      const paymentRepository = createPaymentRepository();

      const paymentData: Omit<Payment, "id" | "createdAt"> = {
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 5000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
        stripeChargeId: `ch_test_${randomUUID()}`,
        failureReason: "Test failure reason",
      };

      const payment = await paymentRepository.create(paymentData);

      expect(payment).toBeDefined();
      expect(payment.stripe_charge_id || payment.stripeChargeId).toBe(
        paymentData.stripeChargeId
      );
      expect(payment.failure_reason || payment.failureReason).toBe(
        paymentData.failureReason
      );
    });

    it("should create payments with different statuses", async () => {
      const paymentRepository = createPaymentRepository();

      const statuses: Array<"PENDING" | "COMPLETED" | "FAILED" | "REFUNDED"> = [
        "PENDING",
        "COMPLETED",
        "FAILED",
        "REFUNDED",
      ];

      for (const status of statuses) {
        const paymentData: Omit<Payment, "id" | "createdAt"> = {
          studentId: testStudentId,
          courseId: testCourseId,
          amount: 10000,
          currency: "USD",
          status,
          stripePaymentIntentId: `pi_test_${randomUUID()}_${status}`,
        };

        const payment = await paymentRepository.create(paymentData);
        expect(payment.status).toBe(status);
      }
    });
  });

  describe("Property: Payment Update Preservation", () => {
    it("should update payment status to COMPLETED", async () => {
      const paymentRepository = createPaymentRepository();

      // Create initial payment
      const created = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
      });

      // Update status
      const updated = await paymentRepository.updateStatus(
        created.id,
        "COMPLETED",
        {
          stripeChargeId: `ch_test_${randomUUID()}`,
          completedAt: new Date(),
        }
      );

      expect(updated.id).toBe(created.id);
      expect(updated.status).toBe("COMPLETED");
      expect(updated.stripe_charge_id || updated.stripeChargeId).toBeDefined();
      expect(updated.completed_at || updated.completedAt).toBeDefined();
    });

    it("should update payment status to FAILED with reason", async () => {
      const paymentRepository = createPaymentRepository();

      // Create initial payment
      const created = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
      });

      // Update status to failed
      const updated = await paymentRepository.updateStatus(
        created.id,
        "FAILED",
        {
          failureReason: "Insufficient funds",
        }
      );

      expect(updated.status).toBe("FAILED");
      expect(updated.failure_reason || updated.failureReason).toBe(
        "Insufficient funds"
      );
    });
  });

  describe("Property: Payment Refund Preservation", () => {
    it("should record a refund correctly", async () => {
      const paymentRepository = createPaymentRepository();

      // Create completed payment
      const created = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "COMPLETED",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
      });

      // Record refund
      const refunded = await paymentRepository.recordRefund(
        created.id,
        10000,
        "Customer requested refund"
      );

      expect(refunded.status).toBe("REFUNDED");
      expect(refunded.refunded_amount || refunded.refundedAmount).toBe(10000);
      expect(refunded.refund_reason || refunded.refundReason).toBe(
        "Customer requested refund"
      );
      expect(refunded.refunded_at || refunded.refundedAt).toBeDefined();
    });

    it("should record partial refund", async () => {
      const paymentRepository = createPaymentRepository();

      // Create completed payment
      const created = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "COMPLETED",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
      });

      // Record partial refund
      const refunded = await paymentRepository.recordRefund(
        created.id,
        5000,
        "Partial refund"
      );

      expect(refunded.status).toBe("REFUNDED");
      expect(refunded.refunded_amount || refunded.refundedAmount).toBe(5000);
    });
  });

  describe("Property: Payment Fetch Preservation", () => {
    it("should fetch payment by id", async () => {
      const paymentRepository = createPaymentRepository();

      // Create payment
      const created = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}`,
      });

      // Fetch by id
      const fetched = await paymentRepository.findById(created.id);

      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.amount).toBe(10000);
    });

    it("should fetch payment by stripe payment intent", async () => {
      const paymentRepository = createPaymentRepository();

      const intentId = `pi_test_${randomUUID()}`;

      // Create payment
      await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: intentId,
      });

      // Fetch by stripe intent
      const fetched =
        await paymentRepository.findByStripePaymentIntent(intentId);

      expect(fetched).toBeDefined();
      expect(
        fetched!.stripe_payment_intent_id || fetched!.stripePaymentIntentId
      ).toBe(intentId);
    });

    it("should fetch payments by student", async () => {
      const paymentRepository = createPaymentRepository();

      // Create multiple payments
      const payment1 = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "COMPLETED",
        stripePaymentIntentId: `pi_test_${randomUUID()}_1`,
      });

      const payment2 = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 5000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}_2`,
      });

      // Fetch by student
      const payments = await paymentRepository.findByStudent(testStudentId);

      expect(payments).toBeDefined();
      expect(payments.length).toBeGreaterThanOrEqual(2);

      const paymentIds = payments.map((p) => p.id);
      expect(paymentIds).toContain(payment1.id);
      expect(paymentIds).toContain(payment2.id);
    });

    it("should fetch payments by course", async () => {
      const paymentRepository = createPaymentRepository();

      // Create multiple payments
      const payment1 = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 10000,
        currency: "USD",
        status: "COMPLETED",
        stripePaymentIntentId: `pi_test_${randomUUID()}_1`,
      });

      const payment2 = await paymentRepository.create({
        studentId: testStudentId,
        courseId: testCourseId,
        amount: 5000,
        currency: "USD",
        status: "PENDING",
        stripePaymentIntentId: `pi_test_${randomUUID()}_2`,
      });

      // Fetch by course
      const payments = await paymentRepository.findByCourse(testCourseId);

      expect(payments).toBeDefined();
      expect(payments.length).toBeGreaterThanOrEqual(2);

      const paymentIds = payments.map((p) => p.id);
      expect(paymentIds).toContain(payment1.id);
      expect(paymentIds).toContain(payment2.id);
    });

    it("should return null for non-existent payment", async () => {
      const paymentRepository = createPaymentRepository();

      const nonExistentId = randomUUID();
      const fetched = await paymentRepository.findById(nonExistentId);

      expect(fetched).toBeNull();
    });
  });
});
