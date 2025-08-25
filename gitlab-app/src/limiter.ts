import { createClient } from "redis";

let redis: ReturnType<typeof createClient> | null = null;

async function getRedis() {
  if (!redis) {
    redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    redis.on("error", (err) => console.error("Redis error:", err));
    redis.on("connect", () => console.log("Connected to Redis"));

    await redis.connect();
  }

  return redis;
}

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 10;
const WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW) || 60 * 10; // 10 minutes

export async function limitByUser(key: string): Promise<boolean> {
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
