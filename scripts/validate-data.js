import { readFile } from "node:fs/promises";
import { validateDatasets } from "./lib/data-schema.js";

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
try {
  const [en, fr, distributions] = await Promise.all([
    read("ee-draws"), read("ee-draws-fr"), read("distribution"),
  ]);
  validateDatasets(en, fr, distributions);
  console.log(`Validated ${en.draws.length} bilingual draws and ${distributions.length} pool snapshots`);
} catch (error) {
  console.error("Data validation failed:", error.message);
  process.exitCode = 1;
}
