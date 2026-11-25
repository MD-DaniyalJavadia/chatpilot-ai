import type { NextFunction, Request, Response } from 'express';

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(maxRequests: number | (() => number), windowMs: number) {
  const buckets = new Map<string, RateBucket>();

  const pruneExpired = (now: number) => {
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  };

  const cleanupTimer = setInterval(() => {
    pruneExpired(Date.now());
  }, Math.max(60_000, Math.min(windowMs * 5, 300_000)));
  cleanupTimer.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    if (buckets.size > 500) {
      pruneExpired(now);
    }
    const limit = typeof maxRequests === 'function' ? Math.max(1, maxRequests()) : maxRequests;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (existing.count >= limit) {
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
