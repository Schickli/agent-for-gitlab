// Rate limiting can be disabled entirely to remove the runtime dependency on Redis.
// Disable by setting RATE_LIMITING_ENABLED=false
const RATE_LIMITING_ENABLED = process.env.RATE_LIMITING_ENABLED !== "false"; // default true

// Dynamic import so that if rate limiting is disabled the 'redis' package is never required
let redis: any = null;

async function getRedis() {
  if (!RATE_LIMITING_ENABLED) {
    throw new Error("Rate limiting disabled");
  }

  if (!redis) {
    const { createClient } = await import("redis").catch((e) => {
      throw new Error(
        `Redis client not available. Install 'redis' package or enable RATE_LIMITING_ENABLED=false to skip. Underlying error: ${e}`
      );
    });

    redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    redis.on("error", (err: any) => console.error("Redis error:", err));
    redis.on("connect", () => console.log("Connected to Redis"));

    await redis.connect();
  }

  return redis;
}

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 10;
const WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW) || 60 * 10; // 10 minutes

export async function limitByUser(key: string): Promise<boolean> {
  // Short‑circuit when disabled
  if (!RATE_LIMITING_ENABLED) {
    return true; // unlimited
  }

  try {
    const client = await getRedis();
    const now = Math.floor(Date.now() / 1000);

    // Remove old entries
    await client.zRemRangeByScore(key, 0, now - WINDOW_SECONDS);

    // Count current entries
    const count = await client.zCard(key);

    if (count >= MAX_REQUESTS) {
      return false;
    }

    // Add new entry
    await client.zAdd(key, {
      score: now,
      value: `${now}-${Math.random()}`,
    });
    await client.expire(key, WINDOW_SECONDS);

    return true;
  } catch (error) {
    console.error("Rate limiting error:", error);
    // If Redis fails, allow the request (fail open)
    return true;
  }
}

export const rateLimitingEnabled = RATE_LIMITING_ENABLED;
