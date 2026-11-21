import "server-only";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const entries = new Map<string, RateLimitEntry>();
const MAX_RATE_LIMIT_ENTRIES = 10_000;
let lastCleanupAt = 0;

function cleanupExpiredEntries(now: number) {
  if (now - lastCleanupAt < 5 * 60 * 1000) {
    return;
  }

  lastCleanupAt = now;

  for (const [key, entry] of entries) {
    if (entry.resetAt <= now) {
      entries.delete(key);
    }
  }
}

export function getRequestAddress(request: Request) {
  const address =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  return address.slice(0, 128);
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    const expectedOrigin = new URL(
      process.env.NEXT_PUBLIC_APP_URL?.trim() || request.url,
    ).origin;

    return origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function consumeRateLimit({
  key,
  limit,
  windowMs,
}: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  cleanupExpiredEntries(now);

  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;

    if (entries.size >= MAX_RATE_LIMIT_ENTRIES) {
      cleanupExpiredEntries(now);

      if (entries.size >= MAX_RATE_LIMIT_ENTRIES) {
        const overflow = Math.max(1, Math.ceil(MAX_RATE_LIMIT_ENTRIES * 0.1));
        let removed = 0;

        for (const entryKey of entries.keys()) {
          entries.delete(entryKey);
          removed += 1;

          if (removed >= overflow) {
            break;
          }
        }
      }
    }

    entries.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  entries.set(key, current);

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed
      ? {}
      : { "Retry-After": String(result.retryAfterSeconds) }),
  };
}
