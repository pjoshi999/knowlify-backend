import { Pool, PoolClient, PoolConfig, QueryResult, QueryResultRow } from "pg";
import { createModuleLogger } from "../../shared/logger.js";

const log = createModuleLogger("database");

interface DatabaseConfig {
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
}

let pool: Pool | null = null;
let isReady = false;
let isConnecting = false;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));

/** Verify the pool has a live connection by running SELECT 1. */
const verifyConnection = async (): Promise<boolean> => {
  if (!pool) return false;
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
};

const startBackgroundReconnect = (config: DatabaseConfig): void => {
  if (isConnecting) return;
  isConnecting = true;

  void (async (): Promise<void> => {
    let attempt = 0;

    while (!isReady) {
      attempt++;
      const ok = await verifyConnection();

      if (ok) {
        isReady = true;
        isConnecting = false;
        log.info(
          {
            attempt,
            host: config.connectionString.replace(/\/\/.*:.*@/, "//***:***@"),
          },
          "Database connected successfully (background)"
        );

        void keepAliveLoop(config);
        return;
      }
      const backoffMs = Math.min(Math.pow(2, attempt) * 1000, 15000);
      log.warn(
        { attempt, backoffMs },
        "Database not yet reachable — retrying in background..."
      );
      await delay(backoffMs);
    }
  })();
};

const keepAliveLoop = async (config: DatabaseConfig): Promise<void> => {
  while (true) {
    await delay(30_000);
    const ok = await verifyConnection();
    if (!ok) {
      log.warn("Keep-alive ping failed — re-arming background reconnect");
      isReady = false;
      startBackgroundReconnect(config);
      return;
    }
  }
};

export const createDatabasePool = (config: DatabaseConfig): Pool => {
  if (pool) return pool;

  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    min: 0,
    max: config.max ?? 10,
    connectionTimeoutMillis: 60_000,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    allowExitOnIdle: true,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  };

  pool = new Pool(poolConfig);

  pool.on("error", (err: Error) => {
    log.error({ err }, "Pool emitted error — marking db as not ready");
    isReady = false;
    startBackgroundReconnect(config);
  });

  startBackgroundReconnect(config);

  log.info("Database pool created — connecting in background...");
  return pool;
};

export const isDatabaseReady = (): boolean => isReady;

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
    isReady = false;
    await pool.end();
    pool = null;
    log.info("Database pool closed");
  }
};

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const result = await getDatabasePool().query<T>(text, params);
  const duration = Date.now() - start;

  if (duration > 100) {
    log.warn(
      { queryText: text.substring(0, 200), duration, rows: result.rowCount },
      "Slow query detected"
    );
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
    log.error({ err: error }, "Database health check failed");
    return false;
  }
};
