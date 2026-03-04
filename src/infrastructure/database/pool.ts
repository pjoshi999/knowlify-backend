import { Pool, PoolClient, PoolConfig, QueryResult } from "pg";

interface DatabaseConfig {
  connectionString: string;
  min?: number;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

let pool: Pool | null = null;

export const createDatabasePool = (config: DatabaseConfig): Pool => {
  if (pool) {
    return pool;
  }

  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    min: config.min ?? 10,
    max: config.max ?? 50,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    ssl: {
      rejectUnauthorized: false,
    },
  };

  pool = new Pool(poolConfig);

  pool.on("error", (err: Error) => {
    console.error("Unexpected database pool error", err);
  });

  pool.on("connect", () => {
    console.warn("New database connection established");
  });

  pool.on("remove", () => {
    console.warn("Database connection removed from pool");
  });

  return pool;
};

export const getDatabasePool = (): Pool => {
  if (!pool) {
    throw new Error(
      "Database pool not initialized. Call createDatabasePool first."
    );
  }
  return pool;
};

export const closeDatabasePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

export const query = async <T = unknown>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const result = await getDatabasePool().query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 100) {
    console.warn("Slow query detected", {
      text,
      duration,
      rows: result.rowCount,
    });
  }

  return result;
};

export const getClient = async (): Promise<PoolClient> => {
  return getDatabasePool().connect();
};

export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await getClient();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const healthCheck = async (): Promise<boolean> => {
  try {
    await query("SELECT 1");
    return true;
  } catch (error) {
    console.error("Database health check failed", error);
    return false;
  }
};
