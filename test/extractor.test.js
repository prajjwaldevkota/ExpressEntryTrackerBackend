import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertDrawFormat, mapCategory, mapDrawDistribution, fetchJson, updateData } from "../scripts/extractor.js";
import { scoreRanges, validateDatasets } from "../scripts/lib/data-schema.js";

const round = (number = "1", overrides = {}) => ({
  drawNumber: number, drawDate: "2026-01-01", drawSize: "1,000", drawCRS: "500",
  drawName: "Canadian Experience Class",
  ...Object.fromEntries(scoreRanges.map(({ key }) => [key, "1,000"])),
  ...overrides,
});
const fetcher = rounds => async () => Response.json({ rounds });
const files = ["ee-draws.json", "ee-draws-fr.json", "distribution.json"];
async function directory(t) {
  const dir = await mkdtemp(join(tmpdir(), "ee-extractor-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
const readAll = dir => Promise.all(files.map(name => readFile(join(dir, name), "utf8")));

test("conversion handles bilingual thousands separators and unknown categories", () => {
  const draw = convertDrawFormat(round("2", { drawSize: "1\u202f234", drawName: "New category" }));
  assert.equal(draw.invitationsIssued, 1234);
  assert.equal(draw.category, "New category");
  assert.equal(mapCategory("No program specified"), null);
  assert.equal(mapCategory("Federal Skilled Trades"), "FST");
  assert.equal(convertDrawFormat(round("2", { drawName: "Catégorie française" }), "fr").category, "Catégorie française");
});

test("invalid upstream fields cannot silently become NaN or invalid dates", () => {
  for (const overrides of [
    { drawNumber: "1oops" }, { drawSize: "12x" }, { drawSize: "" },
    { drawCRS: "1201" }, { drawDate: "2026-02-30" }, { drawName: null },
  ]) assert.throws(() => convertDrawFormat(round("1", overrides)));
});

test("missing pool values are skipped instead of reported as zero", () => {
  assert.equal(mapDrawDistribution(round("1", { dd1: undefined })), null);
  assert.equal(mapDrawDistribution(round("1", { dd2: "" })), null);
  assert.equal(mapDrawDistribution(round("1", { dd1: "0" })).ranges[0].value, "0");
});

test("HTTP errors, malformed JSON, and timeouts propagate", async () => {
  await assert.rejects(fetchJson("https://example.test", { attempts: 1, fetchImpl: async () => new Response("", { status: 503 }) }), /HTTP 503/);
  await assert.rejects(fetchJson("https://example.test", { attempts: 1, fetchImpl: async () => new Response("not json") }));
  await assert.rejects(fetchJson("https://example.test", { attempts: 1, fetchImpl: async () => { throw new DOMException("Timeout", "TimeoutError"); } }), /Timeout/);
  let calls = 0;
  await assert.rejects(fetchJson("https://example.test", { fetchImpl: async () => { calls++; return new Response("", { status: 404 }); } }), /404/);
  assert.equal(calls, 1);
});

test("transient HTTP errors retry and succeed", async () => {
  let calls = 0;
  const result = await fetchJson("https://example.test", { attempts: 2, fetchImpl: async () => {
    calls++;
    return calls === 1 ? new Response("", { status: 503 }) : Response.json({ rounds: [] });
  } });
  assert.equal(calls, 2);
  assert.deepEqual(result, { rounds: [] });
});

test("updates are idempotent, apply corrections, backfill pools and preserve history", async t => {
  const dataDir = await directory(t);
  await updateData({ dataDir, fetchImpl: fetcher([round()]) });
  await writeFile(join(dataDir, "distribution.json"), "[]");
  const result = await updateData({ dataDir, fetchImpl: fetcher([round("1", { drawCRS: "510" }), round("2")]) });
  assert.equal(result.distributions, 2);
  const [en, fr, pool] = (await readAll(dataDir)).map(JSON.parse);
  validateDatasets(en, fr, pool);
  assert.equal(en.draws.find(d => d.drawNumber === 1).minimumCRS, 510);
  assert.equal(en.draws[0].drawNumber, 2);
  const before = await readAll(dataDir);
  const unchanged = await updateData({ dataDir, fetchImpl: fetcher([round("1", { drawCRS: "510" }), round("2")]) });
  assert.deepEqual(unchanged.changed, []);
  assert.deepEqual(await readAll(dataDir), before);
  await updateData({ dataDir, fetchImpl: fetcher([round("3")]) });
  assert.equal(JSON.parse((await readAll(dataDir))[0]).draws.length, 3);
});

test("suffixed IRCC rounds replace the old ambiguous record without losing either round", async t => {
  const dataDir = await directory(t);
  await updateData({ dataDir, fetchImpl: fetcher([round("91")]) });
  const result = await updateData({ dataDir, fetchImpl: fetcher([round("91a"), round("91b")]) });
  assert.equal(result.draws, 2);
  const [en, fr, pool] = (await readAll(dataDir)).map(JSON.parse);
  validateDatasets(en, fr, pool);
  assert.deepEqual(en.draws.map(d => d.roundId), ["91b", "91a"]);
  assert.deepEqual(pool.map(d => d.roundId), ["91b", "91a"]);
});

test("invalid or mismatched source snapshots leave all existing files intact", async t => {
  const dataDir = await directory(t);
  await updateData({ dataDir, fetchImpl: fetcher([round()]) });
  const before = await readAll(dataDir);
  for (const bad of [[], [round("2", { drawSize: "oops" })], [round("2"), round("2")]]) {
    await assert.rejects(updateData({ dataDir, fetchImpl: fetcher(bad) }));
    assert.deepEqual(await readAll(dataDir), before);
  }
  await assert.rejects(updateData({ dataDir, fetchImpl: async url =>
    Response.json({ rounds: [round(url.includes("_en.") ? "2" : "3")] }) }), /differ/);
  assert.deepEqual(await readAll(dataDir), before);
});

test("corrupt local JSON stops the updater without overwriting history", async t => {
  const dataDir = await directory(t);
  await writeFile(join(dataDir, "ee-draws.json"), "{broken");
  await assert.rejects(updateData({ dataDir, fetchImpl: fetcher([round()]) }));
  assert.equal(await readFile(join(dataDir, "ee-draws.json"), "utf8"), "{broken");
});
