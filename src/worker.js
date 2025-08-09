import { Hono } from "hono";
import { cors } from "hono/cors";
import { getApiInfo } from "./controllers/api.controller";
import { getPoolStats, getPoolProgress } from "./controllers/pool.controller";
import { getCategories } from "./controllers/category.controller";
import { getDraws, getLatestDraw } from "./controllers/draws.controller";
import { requestLogger } from "./middleware/logger";
import { getMemoryStats } from "./utils/dataLoader.js";

const app = new Hono();

app.use("*", cors());
app.use("*", requestLogger);

app.get("/", async (c) => {
  return await getApiInfo(c);
});

app.get("/api/categories", async (c) => {
  return await getCategories(c);
});

app.get("/api/pool", async (c) => {
  return await getPoolStats(c);
});

app.get("/api/pool/progress", async (c) => {
  return await getPoolProgress(c);
});

app.get("/api/draws", async (c) => {
  return await getDraws(c);
});

app.get("/api/draws/latest", async (c) => {
  return await getLatestDraw(c);
});

import { cache } from "./utils/cache.js";
import { performanceStats } from "./middleware/logger.js";

// Add cache stats endpoint for monitoring
app.get("/api/stats", async (c) => {
  return c.json({
    cache: cache.getStats(),
    performance: performanceStats.getStats(),
    memory: getMemoryStats(),
    timestamp: new Date().toISOString()
  });
});

// Export the fetch handler for Cloudflare Workers
export default {
  fetch: app.fetch,
};
