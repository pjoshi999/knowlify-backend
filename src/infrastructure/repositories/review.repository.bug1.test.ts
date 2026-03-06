/**
 * Bug Condition Exploration Test - Bug 1: Missing deleted_at Column
 *
 * **Validates: Requirements 2.1**
 *
 * CRITICAL: This test is EXPECTED TO FAIL on unfixed code.
 * The test failure confirms that Bug 1 exists (missing deleted_at column).
 *
 * When this test PASSES after implementing the fix, it confirms the bug is resolved.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createReviewRepository } from "./review.repository.js";
import {
  query,
  createDatabasePool,
  closeDatabasePool,
} from "../database/pool.js";
import { config } from "../../shared/config.js";
import { randomUUID } from "crypto";

describe("Bug 1: Missing deleted_at Column in Reviews Table", () => {
  let testStudentId: string;
  let testCourseId: string;
  let testReviewId: string;

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

    // Insert test review
    const reviewResult = await query(
      `INSERT INTO reviews (student_id, course_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [testStudentId, testCourseId, 5, "Great course!"]
    );
    testReviewId = reviewResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    await query("DELETE FROM reviews WHERE id = $1", [testReviewId]);
    await query("DELETE FROM courses WHERE id = $1", [testCourseId]);
    await query("DELETE FROM users WHERE id = $1", [testStudentId]);

    // Close database pool
    await closeDatabasePool();
  });

  it("should fail when fetching reviews by course due to missing deleted_at column", async () => {
    const reviewRepository = createReviewRepository();

    // This should fail with "column 'deleted_at' does not exist"
    await expect(reviewRepository.findByCourse(testCourseId)).rejects.toThrow(
      /column.*deleted_at.*does not exist/i
    );
  });

  it("should fail when fetching reviews by student due to missing deleted_at column", async () => {
    const reviewRepository = createReviewRepository();

    // This should fail with "column 'deleted_at' does not exist"
    await expect(reviewRepository.findByStudent(testStudentId)).rejects.toThrow(
      /column.*deleted_at.*does not exist/i
    );
  });

  it("should fail when fetching review by id due to missing deleted_at column", async () => {
    const reviewRepository = createReviewRepository();

    // This should fail with "column 'deleted_at' does not exist"
    await expect(reviewRepository.findById(testReviewId)).rejects.toThrow(
      /column.*deleted_at.*does not exist/i
    );
  });

  it("should fail when soft deleting a review due to missing deleted_at column", async () => {
    const reviewRepository = createReviewRepository();

    // This should fail with "column 'deleted_at' does not exist"
    await expect(reviewRepository.delete(testReviewId)).rejects.toThrow(
      /column.*deleted_at.*does not exist/i
    );
  });

  it("should fail when fetching course statistics due to missing deleted_at column", async () => {
    const reviewRepository = createReviewRepository();

    // This should fail with "column 'deleted_at' does not exist"
    await expect(reviewRepository.getCourseStats(testCourseId)).rejects.toThrow(
      /column.*deleted_at.*does not exist/i
    );
  });
});
