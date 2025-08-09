import { cache, generateCacheKey } from "../utils/cache.js";
import { getDrawsWithPagination, getLatestDrawOptimized } from "../utils/dataLoader.js";

const getDraws = async (c) => {
  const year = c.req.query("year");
  const category = c.req.query("category");
  const lang = c.req.query("lang") || "en";
  const page = parseInt(c.req.query("page")) || 1;
  const limit = parseInt(c.req.query("limit")) || 50;

  // Generate cache key based on parameters
  const cacheKey = generateCacheKey('draws', { year, category, lang, page, limit });
  const cachedResult = cache.get(cacheKey);
  
  if (cachedResult) {
    return c.json(cachedResult);
  }

  try {
    const result = await getDrawsWithPagination(page, limit, {
      year,
      category,
      lang
    });

    // Cache for 5 minutes
    cache.set(cacheKey, result, 5 * 60 * 1000);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching draws:", error);
    return c.json({ draws: [], pagination: { page, limit, totalDraws: 0, totalPages: 0 } }, 500);
  }
};

const getLatestDraw = async (c) => {
  const lang = c.req.query("lang") || "en";
  
  // Generate cache key
  const cacheKey = generateCacheKey('latest_draw', { lang });
  const cachedResult = cache.get(cacheKey);
  
  if (cachedResult) {
    return c.json(cachedResult);
  }

  try {
    const latestDraw = await getLatestDrawOptimized(lang);
    const result = { draw: latestDraw };
    
    // Cache for 2 minutes since this changes frequently
    cache.set(cacheKey, result, 2 * 60 * 1000);
    return c.json(result);
  } catch (error) {
    console.error("Error fetching latest draw:", error);
    return c.json({ draw: {} }, 500);
  }
};

export { getDraws, getLatestDraw };
