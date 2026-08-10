import type { Request, Response, NextFunction, RequestHandler } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Name used to namespace buckets so different routes don't share counters. */
  name: string;
}

// In-memory fixed-window limiter. Per-process only — on serverless each warm
// instance keeps its own counters, so this is a mitigation, not a guarantee.
const buckets = new Map<string, Bucket>();

function pruneExpired(now: number) {
  if (buckets.size < 10_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit({ windowMs, max, name }: RateLimitOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    pruneExpired(now);

    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const key = `${name}:${ip}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }
    next();
  };
}
