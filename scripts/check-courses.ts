import {
  createDatabasePool,
  query,
  closeDatabasePool,
} from "../src/infrastructure/database/pool.js";
import { config } from "../src/shared/config.js";

async function checkCourses() {
  createDatabasePool({
    connectionString: config.database.url,
    max: config.database.poolMax,
  });

  try {
    const result = await query(
      `SELECT id, name, category, price_amount/100 as price_usd, status, created_at
       FROM courses
       ORDER BY created_at DESC
       LIMIT 10`
    );

    console.log("\n📚 Current Courses in Database:\n");
    console.log(`Total: ${result.rows.length} courses\n`);

    result.rows.forEach((course, index) => {
      console.log(`${index + 1}. ${course.name}`);
      console.log(`   Category: ${course.category}`);
      console.log(`   Price: $${course.price_usd}`);
      console.log(`   Status: ${course.status}`);
      console.log(
        `   Created: ${new Date(course.created_at).toLocaleDateString()}\n`
      );
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await closeDatabasePool();
  }
}

checkCourses();
