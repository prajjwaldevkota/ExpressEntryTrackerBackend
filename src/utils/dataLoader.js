import enData from "../../data/ee-draws.json" with { type: "json" };
import frData from "../../data/ee-draws-fr.json" with { type: "json" };
import { drawId, newestFirst } from "./draws.js";

// Bundled data is immutable for the lifetime of a deployment. Sort once instead
// of repeatedly compressing, caching and decompressing the same data.
const datasets = {
  en: { draws: [...enData.draws].sort(newestFirst) },
  fr: { draws: [...frData.draws].sort(newestFirst) },
};
const englishCategories = new Map(enData.draws.map(d => [drawId(d), d.category]));

export const loadData = async () => datasets;

export const getDrawsWithPagination = async (page = 1, limit = 50, filters = {}) => {
  const draws = datasets[filters.lang || "en"].draws.filter(draw => {
    if (filters.year && draw.year !== filters.year) return false;
    if (!filters.category) return true;
    const category = filters.category.toLowerCase();
    return draw.category?.toLowerCase() === category ||
      englishCategories.get(drawId(draw))?.toLowerCase() === category;
  });
  const totalPages = Math.ceil(draws.length / limit);
  return {
    draws: draws.slice((page - 1) * limit, page * limit),
    pagination: {
      page, limit, totalDraws: draws.length, totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1 && totalPages > 0,
    },
  };
};

export const findLatestDraw = (draws, now = new Date()) => {
  const today = now.toISOString().slice(0, 10);
  return draws.reduce((latest, draw) => {
    if (draw.date > today) return latest;
    if (!latest || draw.date > latest.date ||
        (draw.date === latest.date && newestFirst(draw, latest) < 0)) return draw;
    return latest;
  }, null) || {};
};

export const getLatestDrawOptimized = async (lang = "en") => findLatestDraw(datasets[lang].draws);

// Serialized sizes describe the data, not the runtime's heap allocation.
export const getMemoryStats = () => ({
  compressed: false,
  englishDataBytes: new TextEncoder().encode(JSON.stringify(datasets.en)).byteLength,
  frenchDataBytes: new TextEncoder().encode(JSON.stringify(datasets.fr)).byteLength,
});
