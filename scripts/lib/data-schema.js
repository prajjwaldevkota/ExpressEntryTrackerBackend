import { drawId } from "../../src/utils/draws.js";

export const scoreRanges = [
  "601-1200", "501-600", "451-500", "491-500", "481-490", "471-480",
  "461-470", "451-460", "401-450", "441-450", "431-440", "421-430",
  "411-420", "401-410", "351-400", "301-350", "0-300", "Total",
].map((range, i) => ({ key: `dd${i + 1}`, range }));

export function assertDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid date: ${value}`);
  }
}

export function parseInteger(value, name, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const text = String(value ?? "").replace(/[,\s\u00a0\u202f]/g, "");
  const number = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return number;
}

function unique(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (!Number.isSafeInteger(record.drawNumber) || record.drawNumber < 1 || ids.has(drawId(record)) ||
        (record.roundId !== undefined && !new RegExp(`^${record.drawNumber}[a-z]$`).test(record.roundId))) {
      throw new Error(`Invalid or duplicate draw number in ${label}: ${record.drawNumber}`);
    }
    ids.add(drawId(record));
  }
}

export function validateDraws(data, label) {
  if (!data || !Array.isArray(data.draws) || data.draws.length === 0) {
    throw new Error(`Empty or invalid ${label} draws`);
  }
  unique(data.draws, label);
  for (const draw of data.draws) {
    assertDate(draw.date);
    if (draw.year !== draw.date.slice(0, 4) ||
        !Number.isSafeInteger(draw.invitationsIssued) || draw.invitationsIssued < 0 ||
        !Number.isInteger(draw.minimumCRS) || draw.minimumCRS < 0 || draw.minimumCRS > 1200 ||
        !(draw.category === null || (typeof draw.category === "string" && draw.category.trim()))) {
      throw new Error(`Invalid draw ${draw.drawNumber} in ${label}`);
    }
  }
}

export function validateDistributions(data) {
  if (!Array.isArray(data)) throw new Error("Invalid distribution dataset");
  unique(data, "distribution");
  for (const record of data) {
    assertDate(record.drawDate);
    if (!Array.isArray(record.ranges) || record.ranges.length !== scoreRanges.length) {
      throw new Error(`Invalid ranges for draw ${record.drawNumber}`);
    }
    for (const { key, range } of scoreRanges) {
      const matches = record.ranges.filter(item => item.key === key && item.range === range);
      if (matches.length !== 1) throw new Error(`Invalid range ${key} for draw ${record.drawNumber}`);
      parseInteger(matches[0].value, key);
    }
  }
}

export function validateDatasets(en, fr, distributions) {
  validateDraws(en, "English");
  validateDraws(fr, "French");
  validateDistributions(distributions);
  const french = new Map(fr.draws.map(draw => [drawId(draw), draw]));
  if (en.draws.length !== fr.draws.length) throw new Error("English and French draw counts differ");
  const english = new Map(en.draws.map(draw => [drawId(draw), draw]));
  for (const draw of en.draws) {
    const translated = french.get(drawId(draw));
    if (!translated || ["date", "year", "invitationsIssued", "minimumCRS"].some(key => translated[key] !== draw[key])) {
      throw new Error(`English and French data differ for draw ${draw.drawNumber}`);
    }
  }
  for (const distribution of distributions) {
    if (english.get(drawId(distribution))?.date !== distribution.drawDate) {
      throw new Error(`Distribution has no matching draw: ${distribution.drawNumber}`);
    }
  }
}
