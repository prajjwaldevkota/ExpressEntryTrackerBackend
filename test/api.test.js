import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { cache } from "../src/utils/cache.js";
import { findLatestDraw } from "../src/utils/dataLoader.js";
import { drawId } from "../src/utils/draws.js";
import en from "../data/ee-draws.json" with { type: "json" };
import fr from "../data/ee-draws-fr.json" with { type: "json" };
import distributions from "../data/distribution.json" with { type: "json" };

const request = (path, options) => worker.fetch(new Request("https://example.test" + path, options));

test("all documented routes return JSON with security and CORS headers", async () => {
  for (const path of ["/", "/api/draws", "/api/draws/latest", "/api/categories", "/api/pool", "/api/pool/progress", "/api/stats"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /application\/json/);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("content-encoding"), null);
    if (path === "/api/stats") assert.equal(response.headers.get("cache-control"), "no-store");
    await response.json();
  }
});

test("draws paginate in descending order without overlap", async () => {
  const first = await (await request("/api/draws?limit=10")).json();
  const second = await (await request("/api/draws?limit=10&page=2")).json();
  assert.equal(first.draws.length, 10);
  assert.equal(first.pagination.totalDraws, en.draws.length);
  assert.equal(first.pagination.hasNext, true);
  assert.equal(first.pagination.hasPrev, false);
  assert.equal(second.pagination.hasPrev, true);
  assert.equal(new Set([...first.draws, ...second.draws].map(drawId)).size, 20);
  assert.ok(first.draws.at(-1).drawNumber > second.draws[0].drawNumber);
});

test("filters preserve bilingual labels and accept English category codes in French", async () => {
  const year = en.draws[0].year;
  const response = await request(`/api/draws?year=${year}&category=pnp&lang=fr&limit=100`);
  const result = await response.json();
  const ids = new Set(en.draws.filter(d => d.year === year && d.category === "PNP").map(drawId));
  assert.equal(result.pagination.totalDraws, ids.size);
  assert.ok(result.draws.length > 0);
  for (const draw of result.draws) {
    assert.ok(ids.has(drawId(draw)));
    assert.equal(draw.category, fr.draws.find(d => drawId(d) === drawId(draw)).category);
  }
  const category = result.draws[0].category;
  const byLabel = await (await request("/api/draws?lang=fr&category=" + encodeURIComponent(category))).json();
  assert.ok(byLabel.draws.every(d => d.category === category));
});

test("invalid query values return 400 without being cached", async () => {
  const invalid = ["page=0", "page=-1", "page=1.2", "page=2x", "page=", "page=9007199254740992",
    "limit=0", "limit=-1", "limit=101", "limit=abc", "limit=", "year=20", "year=",
    "lang=de", "lang=", "category=", "category=" + "x".repeat(201)];
  for (const query of invalid) {
    const response = await request("/api/draws?" + query);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, "INVALID_QUERY");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const path of ["/api/categories?lang=de", "/api/draws/latest?lang=de"]) {
    assert.equal((await request(path)).status, 400);
  }
});

test("empty results have consistent pagination", async () => {
  const data = await (await request("/api/draws?year=1000&page=2")).json();
  assert.deepEqual(data, {
    draws: [], pagination: { page: 2, limit: 50, totalDraws: 0, totalPages: 0, hasNext: false, hasPrev: false },
  });
});

test("cache hits are observable and query ordering does not change the key", async () => {
  cache.clear();
  const first = await request("/api/draws?page=1&limit=7");
  const second = await request("/api/draws?limit=7&page=1");
  assert.equal(first.headers.get("x-cache-hit"), "false");
  assert.equal(second.headers.get("x-cache-hit"), "true");
  assert.deepEqual(await first.json(), await second.json());
});

test("latest draw excludes future days, uses UTC, and breaks same-day ties", () => {
  const draws = [
    { drawNumber: 10, date: "2026-10-23" },
    { drawNumber: 11, date: "2026-10-24" },
    { drawNumber: 12, date: "2026-10-24" },
    { drawNumber: 13, date: "2026-10-25" },
  ];
  assert.equal(findLatestDraw(draws, new Date("2026-10-24T23:59:59Z")).drawNumber, 12);
  assert.equal(findLatestDraw(draws, new Date("2026-10-23T23:30:00-02:00")).drawNumber, 12);
  assert.deepEqual(findLatestDraw([], new Date()), {});
});

test("pool endpoints use the latest two snapshots", async () => {
  const sorted = [...distributions].sort((a, b) => b.drawNumber - a.drawNumber);
  const current = await (await request("/api/pool")).json();
  const progress = await (await request("/api/pool/progress")).json();
  assert.equal(current.pool.drawNumber, sorted[0].drawNumber);
  assert.equal(progress.pool.current.drawNumber, sorted[0].drawNumber);
  assert.equal(progress.pool.previous.drawNumber, sorted[1].drawNumber);
});

test("unknown routes use JSON errors and HEAD/preflight remain supported", async () => {
  const missing = await request("/missing");
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
  const head = await request("/api/draws", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  const preflight = await request("/api/draws", {
    method: "OPTIONS", headers: { origin: "https://example.test", "access-control-request-method": "GET" },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-methods"), /GET/);
});
