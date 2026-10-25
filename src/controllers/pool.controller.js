import drawsData from "../../data/distribution.json" with { type: "json" };
import { newestFirst } from "../utils/draws.js";

// Data is bundled, so ordering can be computed once per Worker isolate.
const snapshots = [...drawsData].sort(newestFirst);
const notFound = c => c.json({
  error: { code: "NOT_FOUND", message: "No pool data found" },
}, 404);

export const getPoolStats = c => snapshots.length
  ? c.json({ pool: snapshots[0] })
  : notFound(c);

export const getPoolProgress = c => snapshots.length
  ? c.json({ pool: { current: snapshots[0], previous: snapshots[1] || null } })
  : notFound(c);
