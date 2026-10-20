const todayUtc = () => new Date().toISOString().slice(0, 10);

/** Sliding-window limiter keyed by (bucket, ip). In-memory: App Service F1 runs one instance. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  /** Returns seconds until the next slot frees up, or 0 if allowed (and records the hit). */
  take(bucket: string, key: string, limit: number, windowMs: number): number {
    const k = `${bucket}|${key}`;
    const now = Date.now();
    const arr = (this.hits.get(k) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) {
      this.hits.set(k, arr);
      return Math.ceil((windowMs - (now - arr[0])) / 1000);
    }
    arr.push(now);
    this.hits.set(k, arr);
    if (this.hits.size > 50_000) this.sweep(windowMs);
    return 0;
  }

  private sweep(windowMs: number) {
    const now = Date.now();
    for (const [k, arr] of this.hits) if (!arr.some((t) => now - t < windowMs)) this.hits.delete(k);
  }
}

/** Counts LLM-backed shopkeeper turns per UTC day so the free quota is never blown. */
export class DailyBudget {
  private day = todayUtc();
  private used = 0;

  constructor(private max: number) {}

  remaining(): number {
    this.roll();
    return Math.max(0, this.max - this.used);
  }

  take(): boolean {
    this.roll();
    if (this.used >= this.max) return false;
    this.used++;
    return true;
  }

  refund() {
    this.used = Math.max(0, this.used - 1);
  }

  private roll() {
    const d = todayUtc();
    if (d !== this.day) {
      this.day = d;
      this.used = 0;
    }
  }
}
