import { createModuleLogger } from "../../shared/logger.js";
import { config } from "../../shared/config.js";

const log = createModuleLogger("db-wakeup");

export const wakeupSupabase = async (): Promise<void> => {
  const url = `${config.supabase.url}/rest/v1/`;

  log.info({ url }, "Sending HTTP wakeup ping to Supabase REST API...");

  try {
    const controller = new globalThis.AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 10_000);

    const res = await globalThis.fetch(url, {
      method: "GET",
      headers: {
        apikey: config.supabase.anonKey,
        Authorization: `Bearer ${config.supabase.anonKey}`,
      },
      signal: controller.signal,
    });

    globalThis.clearTimeout(timeout);

    log.info(
      { status: res.status },
      "Supabase wakeup ping sent — project is resuming"
    );
  } catch (err) {
    log.warn({ err }, "Supabase wakeup ping failed — DB may be deeply paused");
  }
};
