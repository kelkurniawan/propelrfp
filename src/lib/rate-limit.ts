import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });
  }
  return redis;
}

// Strict: auth endpoints (login, signup, forgot password) — 10/min per IP
export const authLimiter = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),
  prefix: "rl:auth",
  analytics: false,
});

// Moderate: AI generation (expensive) — 20/min per IP
export const genLimiter = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(20, "60 s"),
  prefix: "rl:gen",
  analytics: false,
});

// Loose: all other API routes — 100/min per IP
export const apiLimiter = new Ratelimit({
  redis: getRedis(),
  limiter: Ratelimit.slidingWindow(100, "60 s"),
  prefix: "rl:api",
  analytics: false,
});
