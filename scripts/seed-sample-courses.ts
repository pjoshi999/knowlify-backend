/**
 * Seed Sample Courses Script
 *
 * This script creates 5 sample courses based on popular MIT OpenCourseWare courses.
 * These courses will populate the marketplace with realistic data.
 *
 * Run with: tsx scripts/seed-sample-courses.ts
 */

import {
  createDatabasePool,
  query,
  closeDatabasePool,
} from "../src/infrastructure/database/pool.js";
import { config } from "../src/shared/config.js";
import { randomUUID } from "crypto";

interface SampleCourse {
  name: string;
  description: string;
  category: string;
  priceAmount: number;
  thumbnailUrl: string;
  manifest: {
    modules: Array<{
      id: string;
      title: string;
      description: string;
      order: number;
      lessons: Array<{
        id: string;
        title: string;
        description: string;
        order: number;
        type: "VIDEO" | "PDF" | "QUIZ" | "NOTE";
        duration?: number;
      }>;
    }>;
    totalDuration: number;
    totalAssets: number;
  };
}

const sampleCourses: SampleCourse[] = [
  {
    name: "Introduction to Computer Science and Programming in Python",
    description:
      "This course provides an introduction to computer science as a tool for solving real-world analytical problems using Python 3.5. Students will learn computational thinking, basic programming concepts, data structures, algorithms, and how to write programs to solve useful problems. No prior programming experience required.",
    category: "Programming",
    priceAmount: 4999, // $49.99
    thumbnailUrl:
      "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&q=80",
    manifest: {
      modules: [
        {
          id: randomUUID(),
          title: "Introduction to Python",
          description:
            "Learn the basics of Python programming including variables, types, and operators",
          order: 1,
          lessons: [
            {
              id: randomUUID(),
              title: "What is Computation?",
              description: "Introduction to computational thinking",
              order: 1,
              type: "VIDEO",
              duration: 3600,
            },
            {
              id: randomUUID(),
              title: "Python Basics",
              description: "Variables, expressions, and statements",
              order: 2,
              type: "VIDEO",
              duration: 3000,
            },
            {
              id: randomUUID(),
              title: "Lecture Notes - Week 1",
              description: "PDF notes covering introduction",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Problem Set 1",
              description: "Practice problems for Python basics",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Control Flow and Functions",
          description: "Branching, iteration, and function definitions",
          order: 2,
          lessons: [
            {
              id: randomUUID(),
              title: "Branching and Iteration",
              description: "If statements and loops",
              order: 1,
              type: "VIDEO",
              duration: 3200,
            },
            {
              id: randomUUID(),
              title: "Functions and Scope",
              description: "Defining and calling functions",
              order: 2,
              type: "VIDEO",
              duration: 2800,
            },
            {
              id: randomUUID(),
              title: "Lecture Notes - Week 2",
              description: "Control flow concepts",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Problem Set 2",
              description: "Functions and loops exercises",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Data Structures",
          description: "Strings, lists, tuples, and dictionaries",
          order: 3,
          lessons: [
            {
              id: randomUUID(),
              title: "Strings and Lists",
              description: "Working with sequences",
              order: 1,
              type: "VIDEO",
              duration: 3400,
            },
            {
              id: randomUUID(),
              title: "Dictionaries and Tuples",
              description: "Key-value pairs and immutable sequences",
              order: 2,
              type: "VIDEO",
              duration: 3100,
            },
            {
              id: randomUUID(),
              title: "Lecture Notes - Week 3",
              description: "Data structures overview",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Problem Set 3",
              description: "Data structure exercises",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
      ],
      totalDuration: 22500, // ~6.25 hours
      totalAssets: 12,
    },
  },
  {
    name: "Machine Learning with Python",
    description:
      "An in-depth introduction to machine learning covering supervised and unsupervised learning, neural networks, and deep learning. Students will implement algorithms from scratch and use popular libraries like scikit-learn and TensorFlow. Includes hands-on Python projects and real-world applications.",
    category: "Data Science",
    priceAmount: 7999, // $79.99
    thumbnailUrl:
      "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&q=80",
    manifest: {
      modules: [
        {
          id: randomUUID(),
          title: "Introduction to Machine Learning",
          description: "Overview of ML concepts and applications",
          order: 1,
          lessons: [
            {
              id: randomUUID(),
              title: "What is Machine Learning?",
              description: "Types of ML and applications",
              order: 1,
              type: "VIDEO",
              duration: 2700,
            },
            {
              id: randomUUID(),
              title: "Linear Regression",
              description: "First ML algorithm",
              order: 2,
              type: "VIDEO",
              duration: 3600,
            },
            {
              id: randomUUID(),
              title: "Week 1 Notes",
              description: "Introduction materials",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Quiz 1",
              description: "ML fundamentals",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Supervised Learning",
          description: "Classification and regression techniques",
          order: 2,
          lessons: [
            {
              id: randomUUID(),
              title: "Logistic Regression",
              description: "Binary classification",
              order: 1,
              type: "VIDEO",
              duration: 3300,
            },
            {
              id: randomUUID(),
              title: "Decision Trees and Random Forests",
              description: "Tree-based methods",
              order: 2,
              type: "VIDEO",
              duration: 3800,
            },
            {
              id: randomUUID(),
              title: "Week 2 Notes",
              description: "Supervised learning concepts",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Quiz 2",
              description: "Classification exercises",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Neural Networks and Deep Learning",
          description: "Introduction to neural networks",
          order: 3,
          lessons: [
            {
              id: randomUUID(),
              title: "Neural Network Basics",
              description: "Perceptrons and activation functions",
              order: 1,
              type: "VIDEO",
              duration: 4200,
            },
            {
              id: randomUUID(),
              title: "Backpropagation",
              description: "Training neural networks",
              order: 2,
              type: "VIDEO",
              duration: 3900,
            },
            {
              id: randomUUID(),
              title: "Week 3 Notes",
              description: "Deep learning fundamentals",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Final Project",
              description: "Build a neural network",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
      ],
      totalDuration: 25500, // ~7 hours
      totalAssets: 12,
    },
  },
  {
    name: "Web Development with JavaScript",
    description:
      "Learn modern web development from scratch. This course covers HTML, CSS, JavaScript, React, Node.js, and full-stack development. Build real-world projects including a portfolio website, todo app, and e-commerce platform. Perfect for beginners wanting to become web developers.",
    category: "Web Development",
    priceAmount: 5999, // $59.99
    thumbnailUrl:
      "https://images.unsplash.com/photo-1547658719-da2b51169166?w=800&q=80",
    manifest: {
      modules: [
        {
          id: randomUUID(),
          title: "HTML and CSS Fundamentals",
          description: "Building blocks of web pages",
          order: 1,
          lessons: [
            {
              id: randomUUID(),
              title: "HTML Basics",
              description: "Tags, elements, and structure",
              order: 1,
              type: "VIDEO",
              duration: 2400,
            },
            {
              id: randomUUID(),
              title: "CSS Styling",
              description: "Selectors, properties, and layouts",
              order: 2,
              type: "VIDEO",
              duration: 3000,
            },
            {
              id: randomUUID(),
              title: "Week 1 Resources",
              description: "HTML/CSS reference",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Build Your First Webpage",
              description: "Hands-on project",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "JavaScript Programming",
          description: "Interactive web pages with JavaScript",
          order: 2,
          lessons: [
            {
              id: randomUUID(),
              title: "JavaScript Basics",
              description: "Variables, functions, and DOM",
              order: 1,
              type: "VIDEO",
              duration: 3600,
            },
            {
              id: randomUUID(),
              title: "Async JavaScript",
              description: "Promises and async/await",
              order: 2,
              type: "VIDEO",
              duration: 3200,
            },
            {
              id: randomUUID(),
              title: "Week 2 Resources",
              description: "JavaScript guide",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Interactive Todo App",
              description: "Build a todo list",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "React and Modern Frontend",
          description: "Component-based UI development",
          order: 3,
          lessons: [
            {
              id: randomUUID(),
              title: "React Fundamentals",
              description: "Components, props, and state",
              order: 1,
              type: "VIDEO",
              duration: 4000,
            },
            {
              id: randomUUID(),
              title: "React Hooks",
              description: "useState, useEffect, and custom hooks",
              order: 2,
              type: "VIDEO",
              duration: 3500,
            },
            {
              id: randomUUID(),
              title: "Week 3 Resources",
              description: "React documentation",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Build a React App",
              description: "Final project",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
      ],
      totalDuration: 23700, // ~6.5 hours
      totalAssets: 12,
    },
  },
  {
    name: "Data Structures and Algorithms",
    description:
      "Master fundamental data structures and algorithms essential for technical interviews and software engineering. Topics include arrays, linked lists, trees, graphs, sorting, searching, dynamic programming, and complexity analysis. Includes coding challenges and interview preparation.",
    category: "Computer Science",
    priceAmount: 6999, // $69.99
    thumbnailUrl:
      "https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=800&q=80",
    manifest: {
      modules: [
        {
          id: randomUUID(),
          title: "Arrays and Linked Lists",
          description: "Linear data structures",
          order: 1,
          lessons: [
            {
              id: randomUUID(),
              title: "Array Operations",
              description: "Insertion, deletion, and searching",
              order: 1,
              type: "VIDEO",
              duration: 2800,
            },
            {
              id: randomUUID(),
              title: "Linked Lists",
              description: "Singly and doubly linked lists",
              order: 2,
              type: "VIDEO",
              duration: 3200,
            },
            {
              id: randomUUID(),
              title: "Week 1 Notes",
              description: "Linear structures reference",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Coding Challenges 1",
              description: "Array and list problems",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Trees and Graphs",
          description: "Hierarchical and network structures",
          order: 2,
          lessons: [
            {
              id: randomUUID(),
              title: "Binary Trees",
              description: "Tree traversals and operations",
              order: 1,
              type: "VIDEO",
              duration: 3600,
            },
            {
              id: randomUUID(),
              title: "Graph Algorithms",
              description: "BFS, DFS, and shortest paths",
              order: 2,
              type: "VIDEO",
              duration: 4000,
            },
            {
              id: randomUUID(),
              title: "Week 2 Notes",
              description: "Trees and graphs guide",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Coding Challenges 2",
              description: "Tree and graph problems",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Sorting and Dynamic Programming",
          description: "Advanced algorithms",
          order: 3,
          lessons: [
            {
              id: randomUUID(),
              title: "Sorting Algorithms",
              description: "QuickSort, MergeSort, HeapSort",
              order: 1,
              type: "VIDEO",
              duration: 3400,
            },
            {
              id: randomUUID(),
              title: "Dynamic Programming",
              description: "Memoization and tabulation",
              order: 2,
              type: "VIDEO",
              duration: 4200,
            },
            {
              id: randomUUID(),
              title: "Week 3 Notes",
              description: "Algorithm strategies",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Final Exam",
              description: "Comprehensive assessment",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
      ],
      totalDuration: 25200, // ~7 hours
      totalAssets: 12,
    },
  },
  {
    name: "Digital Marketing Fundamentals",
    description:
      "Comprehensive guide to digital marketing including SEO, social media marketing, content marketing, email campaigns, and analytics. Learn to create effective marketing strategies, measure ROI, and grow your online presence. Includes real case studies and practical exercises.",
    category: "Marketing",
    priceAmount: 3999, // $39.99
    thumbnailUrl:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80",
    manifest: {
      modules: [
        {
          id: randomUUID(),
          title: "Introduction to Digital Marketing",
          description: "Overview of digital marketing channels",
          order: 1,
          lessons: [
            {
              id: randomUUID(),
              title: "Digital Marketing Landscape",
              description: "Channels and strategies",
              order: 1,
              type: "VIDEO",
              duration: 2400,
            },
            {
              id: randomUUID(),
              title: "Setting Marketing Goals",
              description: "SMART goals and KPIs",
              order: 2,
              type: "VIDEO",
              duration: 2600,
            },
            {
              id: randomUUID(),
              title: "Week 1 Guide",
              description: "Marketing fundamentals",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Quiz 1",
              description: "Marketing basics assessment",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "SEO and Content Marketing",
          description: "Organic traffic and content strategy",
          order: 2,
          lessons: [
            {
              id: randomUUID(),
              title: "SEO Fundamentals",
              description: "Keywords, on-page, and off-page SEO",
              order: 1,
              type: "VIDEO",
              duration: 3200,
            },
            {
              id: randomUUID(),
              title: "Content Marketing",
              description: "Creating valuable content",
              order: 2,
              type: "VIDEO",
              duration: 2800,
            },
            {
              id: randomUUID(),
              title: "Week 2 Guide",
              description: "SEO and content resources",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Quiz 2",
              description: "SEO knowledge check",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
        {
          id: randomUUID(),
          title: "Social Media and Analytics",
          description: "Social platforms and measuring success",
          order: 3,
          lessons: [
            {
              id: randomUUID(),
              title: "Social Media Marketing",
              description: "Facebook, Instagram, LinkedIn strategies",
              order: 1,
              type: "VIDEO",
              duration: 3000,
            },
            {
              id: randomUUID(),
              title: "Analytics and Reporting",
              description: "Google Analytics and metrics",
              order: 2,
              type: "VIDEO",
              duration: 2700,
            },
            {
              id: randomUUID(),
              title: "Week 3 Guide",
              description: "Social media playbook",
              order: 3,
              type: "PDF",
            },
            {
              id: randomUUID(),
              title: "Final Project",
              description: "Create a marketing plan",
              order: 4,
              type: "QUIZ",
            },
          ],
        },
      ],
      totalDuration: 19300, // ~5.4 hours
      totalAssets: 12,
    },
  },
];

async function seedCourses() {
  console.log("🌱 Starting course seeding...\n");

  // Initialize database
  createDatabasePool({
    connectionString: config.database.url,
    max: config.database.poolMax,
  });

  try {
    // Create instructor user if doesn't exist
    const instructorEmail = "instructor@mitocw.edu";
    let instructorId: string;

    const existingInstructor = await query(
      "SELECT id FROM users WHERE email = $1",
      [instructorEmail]
    );

    if (existingInstructor.rows.length > 0) {
      instructorId = existingInstructor.rows[0].id;
      console.log(`✓ Using existing instructor: ${instructorId}`);
    } else {
      const newInstructor = await query(
        `INSERT INTO users (email, role, name, password)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [
          instructorEmail,
          "INSTRUCTOR",
          "MIT OpenCourseWare",
          "sample_password_hash",
        ]
      );
      instructorId = newInstructor.rows[0].id;
      console.log(`✓ Created instructor: ${instructorId}`);
    }

    console.log("\n📚 Creating sample courses...\n");

    // Insert each course
    for (const course of sampleCourses) {
      const urlSlug = course.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      const result = await query(
        `INSERT INTO courses (
          instructor_id, name, description, category, thumbnail_url,
          price_amount, price_currency, status, url_slug, manifest
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, name`,
        [
          instructorId,
          course.name,
          course.description,
          course.category,
          course.thumbnailUrl,
          course.priceAmount,
          "USD",
          "PUBLISHED",
          urlSlug,
          JSON.stringify(course.manifest),
        ]
      );

      console.log(`✓ Created: ${result.rows[0].name}`);
      console.log(`  ID: ${result.rows[0].id}`);
      console.log(`  Price: $${(course.priceAmount / 100).toFixed(2)}`);
      console.log(`  Modules: ${course.manifest.modules.length}`);
      console.log(`  Total Assets: ${course.manifest.totalAssets}`);
      console.log(
        `  Duration: ${Math.floor(course.manifest.totalDuration / 3600)}h ${Math.floor((course.manifest.totalDuration % 3600) / 60)}m\n`
      );
    }

    console.log("✅ Successfully seeded 5 sample courses!");
    console.log("\n📊 Summary:");
    console.log(`   Total Courses: ${sampleCourses.length}`);
    console.log(
      `   Categories: ${[...new Set(sampleCourses.map((c) => c.category))].join(", ")}`
    );
    console.log(
      `   Price Range: $${Math.min(...sampleCourses.map((c) => c.priceAmount / 100))} - $${Math.max(...sampleCourses.map((c) => c.priceAmount / 100))}`
    );
    console.log("\n🎉 Marketplace is now populated with sample courses!");
  } catch (error) {
    console.error("❌ Error seeding courses:", error);
    throw error;
  } finally {
    await closeDatabasePool();
  }
}

// Run the seeder
seedCourses().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
