export class Cache {
  constructor({ maxSize = 128, defaultTTL = 5 * 60 * 1000, now = Date.now } = {}) {
    if (!Number.isInteger(maxSize) || maxSize < 1) throw new Error("Invalid cache size");
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;
    this.now = now;
  }

  set(key, value, ttl = this.defaultTTL) {
    this.cache.delete(key);
    if (ttl <= 0) return;
    this.pruneExpired();
    if (this.cache.size >= this.maxSize) this.evictOldest();
    this.cache.set(key, { value, expiresAt: this.now() + ttl });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (this.now() >= item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  delete(key) { this.cache.delete(key); }
  clear() { this.cache.clear(); }
  evictOldest() { this.cache.delete(this.cache.keys().next().value); }
  pruneExpired() {
    const now = this.now();
    for (const [key, item] of this.cache) {
      if (now >= item.expiresAt) this.cache.delete(key);
    }
  }
  getStats() {
    this.pruneExpired();
    return { size: this.cache.size, maxSize: this.maxSize };
  }
}

export const cache = new Cache();
export const generateCacheKey = (endpoint, params = {}) => JSON.stringify([
  endpoint,
  Object.entries(params).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)),
]);
