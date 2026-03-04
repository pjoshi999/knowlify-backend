import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import { createDatabasePool, closeDatabasePool, query } from "./pool.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  id: number;
  name: string;
  sql: string;
}

const createMigrationsTable = async (): Promise<void> => {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      executed_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
};

const getExecutedMigrations = async (): Promise<number[]> => {
  const result = await query<{ id: number }>(
    "SELECT id FROM migrations ORDER BY id"
  );
  return result.rows.map((row) => row.id);
};

const getMigrationFiles = async (): Promise<Migration[]> => {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = await fs.readdir(migrationsDir);

  const migrations: Migration[] = [];

  for (const file of files) {
    if (!file.endsWith(".sql")) continue;

    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match?.[1] || !match[2]) continue;

    const id = parseInt(match[1], 10);
    const name = match[2];
    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, "utf-8");

    migrations.push({ id, name, sql });
  }

  return migrations.sort((a, b) => a.id - b.id);
};

const executeMigration = async (migration: Migration): Promise<void> => {
  console.warn(`Executing migration ${migration.id}: ${migration.name}`);

  await query(migration.sql);

  await query("INSERT INTO migrations (id, name) VALUES ($1, $2)", [
    migration.id,
    migration.name,
  ]);

  console.warn(`Migration ${migration.id} completed`);
};

export const runMigrations = async (
  connectionString: string
): Promise<void> => {
  try {
    createDatabasePool({ connectionString });

    await createMigrationsTable();

    const executedMigrations = await getExecutedMigrations();
    const allMigrations = await getMigrationFiles();

    const pendingMigrations = allMigrations.filter(
      (m) => !executedMigrations.includes(m.id)
    );

    if (pendingMigrations.length === 0) {
      console.warn("No pending migrations");
      return;
    }

    console.warn(`Found ${pendingMigrations.length} pending migrations`);

    for (const migration of pendingMigrations) {
      await executeMigration(migration);
    }

    console.warn("All migrations completed successfully");
  } catch (error) {
    console.error("Migration failed", error);
    throw error;
  } finally {
    await closeDatabasePool();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  runMigrations(connectionString)
    .then(() => {
      console.warn("Migrations completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration error:", error);
      process.exit(1);
    });
}
