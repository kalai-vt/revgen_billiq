/** Simple per-key token bucket (spec §5's "rate limiting" / §31's "local API abuse testing") —
 * deliberately small and dependency-free rather than pulling in a rate-limiting package for one
 * in-memory map. Keyed by `${origin}:${deviceId}` in server.ts, so one misbehaving tab can't
 * exhaust the budget for a different origin sharing the same agent. */

export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  /** Returns true if the request is allowed (and consumes one token), false if the caller should
   * be rejected. */
  consume(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefill: now };
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
    bucket.lastRefill = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      return false;
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
