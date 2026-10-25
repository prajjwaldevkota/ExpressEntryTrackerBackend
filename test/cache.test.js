import { test } from "node:test";
import assert from "node:assert/strict";
import { Cache, generateCacheKey } from "../src/utils/cache.js";

test("cache remains bounded when all entries have the same timestamp", () => {
  const cache = new Cache({ maxSize: 2, now: () => 100 });
  for (let i = 0; i < 100; i++) cache.set(String(i), i);
  assert.equal(cache.getStats().size, 2);
  assert.equal(cache.get("0"), null);
  assert.equal(cache.get("99"), 99);
});

test("updating an existing cache key does not evict another entry", () => {
  const cache = new Cache({ maxSize: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 3);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("a"), 3);
});

test("TTL expires at the boundary and expired entries free capacity first", () => {
  let now = 0;
  const cache = new Cache({ maxSize: 2, now: () => now });
  cache.set("live", 1, 100);
  cache.set("expired", 2, 10);
  now = 10;
  assert.equal(cache.get("expired"), null);
  cache.set("new", 3);
  assert.equal(cache.get("live"), 1);
  now = 100;
  assert.equal(cache.get("live"), null);
});

test("structured cache keys avoid delimiter collisions", () => {
  assert.equal(generateCacheKey("draws", { page: 1, lang: "en" }),
    generateCacheKey("draws", { lang: "en", page: 1 }));
  assert.notEqual(generateCacheKey("draws", { a: "b|c:d" }),
    generateCacheKey("draws", { a: "b", c: "d" }));
});
