// Simple in-memory, per-key sliding-window rate limiter shared across API routes.
// Note: this only holds within a single server instance. It is a basic abuse
// mitigation, not a strong guarantee (see getClientIp caveat below).

const globalAny = global as unknown as {
    rateLimitStore?: Map<string, { count: number; resetAt: number }>;
};

if (!globalAny.rateLimitStore) {
    globalAny.rateLimitStore = new Map();
}
const rateLimitStore = globalAny.rateLimitStore;

export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Cap the number of tracked keys so the limiter itself cannot be used to
// exhaust memory. When exceeded, expired entries are purged first.
const MAX_TRACKED_KEYS = 50_000;

function purgeExpired(now: number) {
    for (const [key, record] of rateLimitStore) {
        if (record.resetAt < now) rateLimitStore.delete(key);
    }
}

/**
 * Returns true if the given key has exceeded `maxRequests` within the window.
 */
export function isRateLimited(key: string, maxRequests: number): boolean {
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || record.resetAt < now) {
        if (rateLimitStore.size >= MAX_TRACKED_KEYS) purgeExpired(now);
        rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    if (record.count >= maxRequests) {
        return true;
    }

    record.count++;
    return false;
}

/**
 * Best-effort client IP extraction. NOTE: `x-forwarded-for` / `x-real-ip` are
 * client-controllable unless a trusted proxy overwrites them, so this must not
 * be relied on for security-critical decisions — only soft abuse mitigation.
 */
export function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return request.headers.get('x-real-ip') || 'unknown';
}
