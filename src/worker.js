import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { getApiInfo } from "./controllers/api.controller.js";
import { getPoolStats, getPoolProgress } from "./controllers/pool.controller.js";
import { getCategories } from "./controllers/category.controller.js";
import { getDraws, getLatestDraw } from "./controllers/draws.controller.js";
import { requestLogger, performanceStats } from "./middleware/logger.js";
import { getMemoryStats } from "./utils/dataLoader.js";
import { cache } from "./utils/cache.js";

const app = new Hono();
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "OPTIONS"],
  exposeHeaders: ["X-Response-Time", "X-Cache-Hit"],
  maxAge: 86400,
}));
app.use("*", requestLogger);
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", c.res.ok && c.req.path !== "/api/stats"
    ? "public, max-age=60" : "no-store");
});

app.get("/", getApiInfo);
app.get("/api/categories", getCategories);
app.get("/api/pool", getPoolStats);
app.get("/api/pool/progress", getPoolProgress);
app.get("/api/draws", getDraws);
app.get("/api/draws/latest", getLatestDraw);
app.get("/api/stats", c => c.json({
  scope: "Current Worker isolate only; resets on restart",
  cache: cache.getStats(),
  performance: performanceStats.getStats(),
  memory: getMemoryStats(),
  timestamp: new Date().toISOString(),
}));

app.notFound(c => c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));
app.onError((error, c) => {
  if (error instanceof HTTPException && error.status === 400) {
    return c.json({ error: { code: "INVALID_QUERY", message: error.message } }, 400);
  }
  console.error("Request failed:", error);
  return c.json({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } }, 500);
});

export default { fetch: app.fetch };
