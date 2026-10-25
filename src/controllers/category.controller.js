import { loadData } from "../utils/dataLoader.js";
import { getLanguage } from "../utils/query.js";

export const getCategories = async c => {
  const lang = getLanguage(c);
  const data = await loadData();
  const counts = new Map();
  for (const { category } of data[lang].draws) {
    if (category) counts.set(category, (counts.get(category) || 0) + 1);
  }
  const categories = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category]) => category);
  return c.json({ categories });
};
