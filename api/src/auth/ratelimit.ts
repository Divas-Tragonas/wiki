/* Límit d'intents per IP en una finestra de temps (en memòria: hi ha un sol procés). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(max: number, windowMs: number, now: () => number) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  /* null si es pot; si no, els segons que cal esperar */
  check(key: string): number | null {
    const t = this.now(), from = t - this.windowMs;
    const list = (this.hits.get(key) || []).filter((x) => x > from);
    this.hits.set(key, list);
    if (list.length < this.max) return null;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - t) / 1000));
  }

  hit(key: string) {
    const list = this.hits.get(key) || [];
    list.push(this.now());
    this.hits.set(key, list);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  clear() {
    this.hits.clear();
  }
}
