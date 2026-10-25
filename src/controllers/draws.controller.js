import { cache, generateCacheKey } from "../utils/cache.js";
import { getDrawsWithPagination, getLatestDrawOptimized } from "../utils/dataLoader.js";
import { getDrawQuery, getLanguage } from "../utils/query.js";

const cached = async (c, key, loader, ttl) => {
  let result = cache.get(key);
  c.header("X-Cache-Hit", String(result !== null));
  if (result === null) {
    result = await loader();
    cache.set(key, result, ttl);
  }
  return c.json(result);
};

export const getDraws = async c => {
  const query = getDrawQuery(c);
  return cached(c, generateCacheKey("draws", query),
    () => getDrawsWithPagination(query.page, query.limit, query));
};

export const getLatestDraw = async c => {
  const lang = getLanguage(c);
  // Include the UTC day so future-dated records become visible at midnight.
  const day = new Date().toISOString().slice(0, 10);
  return cached(c, generateCacheKey("latest_draw", { lang, day }),
    async () => ({ draw: await getLatestDrawOptimized(lang) }), 2 * 60 * 1000);
};
