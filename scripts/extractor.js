import { writeFile, readFile, rename, unlink } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { assertDate, parseInteger, scoreRanges, validateDatasets, validateDraws, validateDistributions } from "./lib/data-schema.js";
import { drawId, newestFirst } from "../src/utils/draws.js";

const sources = {
  en: "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json",
  fr: "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_fr.json",
};

export function mapCategory(name) {
  const mappings = [
    [/provincial nominee program/i, "PNP"],
    [/french[- ]language proficiency/i, "French"],
    [/canadian experience class/i, "CEC"],
    [/physician/i, "Physicians"],
    [/healthcare/i, "Healthcare"],
    [/federal skilled trades/i, "FST"],
    [/trade/i, "Trades"],
    [/stem/i, "STEM"],
    [/transport/i, "Transport"],
    [/agriculture|agri-food/i, "Agriculture"],
    [/general/i, "General"],
    [/education/i, "Education"],
    [/no program specified|aucun programme spécifié/i, null],
    [/senior.*manager.*work.*experience/i, "Manager CWE"],
    [/federal skilled worker/i, "FSW"],
  ];
  // Preserve new category names instead of silently discarding them.
  const match = mappings.find(([pattern]) => pattern.test(name));
  return match ? match[1] : name;
}

function identifier(value) {
  const text = String(value);
  if (!/^[1-9]\d*[a-z]?$/.test(text)) throw new Error(`Invalid draw number: ${value}`);
  const drawNumber = parseInteger(text.replace(/[a-z]$/, ""), "draw number", { min: 1 });
  return { drawNumber, ...(/[a-z]$/.test(text) ? { roundId: text } : {}) };
}

export function convertDrawFormat(draw, lang = "en") {
  assertDate(draw.drawDate);
  if (typeof draw.drawName !== "string" || !draw.drawName.trim()) throw new Error("Missing draw name");
  return {
    ...identifier(draw.drawNumber),
    date: draw.drawDate,
    invitationsIssued: parseInteger(draw.drawSize, "invitations"),
    minimumCRS: parseInteger(draw.drawCRS, "CRS", { max: 1200 }),
    category: lang === "fr" ? draw.drawName.trim() : mapCategory(draw.drawName.trim()),
    year: draw.drawDate.slice(0, 4),
  };
}

export function mapDrawDistribution(draw) {
  // Older rounds may lack pool snapshots. Missing values are unknown, not zero.
  if (scoreRanges.some(({ key }) => draw[key] === undefined || draw[key] === null || String(draw[key]).trim() === "")) {
    return null;
  }
  return {
    ...identifier(draw.drawNumber),
    drawDate: draw.drawDate,
    ranges: scoreRanges.map(({ key, range }) => {
      parseInteger(draw[key], key);
      return { key, range, value: String(draw[key]).trim() };
    }),
  };
}

export async function fetchJson(url, { fetchImpl = fetch, attempts = 3, timeoutMs = 15000 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`IRCC returned HTTP ${response.status}`);
        error.permanent = response.status !== 429 && response.status < 500;
        throw error;
      }
      if (!response.body) throw new Error("IRCC response has no body");
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 10 * 1024 * 1024) throw new Error("IRCC response exceeds 10 MB");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error.permanent || attempt === attempts - 1) throw error;
      await delay(500 * 2 ** attempt);
    }
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    // Malformed existing files must never be treated as empty history.
    throw error;
  }
}

const merge = (existing, incoming) => {
  const suffixed = new Set(incoming.filter(record => record.roundId).map(record => record.drawNumber));
  const retained = existing.filter(record => record.roundId || !suffixed.has(record.drawNumber));
  return [...new Map([...retained, ...incoming].map(record => [drawId(record), record])).values()].sort(newestFirst);
};

async function writeJson(path, data) {
  const content = JSON.stringify(data, null, 2) + "\n";
  try {
    if (await readFile(path, "utf8") === content) return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
  return true;
}

export async function updateData({
  dataDir = fileURLToPath(new URL("../data/", import.meta.url)),
  fetchImpl = fetch,
} = {}) {
  const names = ["ee-draws.json", "ee-draws-fr.json", "distribution.json"];
  const [en, fr, distributions] = await Promise.all(names.map((name, i) =>
    readJson(join(dataDir, name), i === 2 ? [] : { draws: [] })));
  // Validate existing files separately so a corrected feed can repair historical
  // disagreements between languages, while malformed files still stop the job.
  if (!Array.isArray(en.draws) || !Array.isArray(fr.draws)) throw new Error("Invalid existing draw datasets");
  if (en.draws.length) validateDraws(en, "existing English");
  if (fr.draws.length) validateDraws(fr, "existing French");
  validateDistributions(distributions);
  const [rawEn, rawFr] = await Promise.all(Object.values(sources).map(url => fetchJson(url, { fetchImpl })));
  if (!Array.isArray(rawEn.rounds) || !rawEn.rounds.length ||
      !Array.isArray(rawFr.rounds) || !rawFr.rounds.length) throw new Error("IRCC returned empty or invalid rounds");
  const incomingEn = { draws: rawEn.rounds.map(draw => convertDrawFormat(draw)) };
  const incomingFr = { draws: rawFr.rounds.map(draw => convertDrawFormat(draw, "fr")) };
  // Check the source snapshots before merging, so a partial bilingual update fails.
  validateDraws(incomingEn, "IRCC English");
  validateDraws(incomingFr, "IRCC French");
  validateDatasets(incomingEn, incomingFr, []);
  const updatedEn = { ...en, draws: merge(en.draws, incomingEn.draws) };
  const updatedFr = { ...fr, draws: merge(fr.draws, incomingFr.draws) };
  const updatedDistributions = merge(distributions, rawEn.rounds.map(mapDrawDistribution).filter(Boolean));
  // Validate every output before writing any file. Each file is replaced atomically.
  validateDatasets(updatedEn, updatedFr, updatedDistributions);
  const outputs = [updatedEn, updatedFr, updatedDistributions];
  const changed = [];
  for (let i = 0; i < names.length; i++) {
    if (await writeJson(join(dataDir, names[i]), outputs[i])) changed.push(names[i]);
  }
  return { changed, draws: updatedEn.draws.length, distributions: updatedDistributions.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  updateData().then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error("Data update failed:", error.message);
    process.exitCode = 1;
  });
}
