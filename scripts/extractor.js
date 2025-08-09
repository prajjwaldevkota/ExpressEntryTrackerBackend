import { writeFile, readFile } from "node:fs/promises";
import https from "node:https";

const scoreRanges = [
  { key: "dd1", range: "601-1200" },
  { key: "dd2", range: "501-600" },
  { key: "dd3", range: "451-500" },
  { key: "dd4", range: "491-500" },
  { key: "dd5", range: "481-490" },
  { key: "dd6", range: "471-480" },
  { key: "dd7", range: "461-470" },
  { key: "dd8", range: "451-460" },
  { key: "dd9", range: "401-450" },
  { key: "dd10", range: "441-450" },
  { key: "dd11", range: "431-440" },
  { key: "dd12", range: "421-430" },
  { key: "dd13", range: "411-420" },
  { key: "dd14", range: "401-410" },
  { key: "dd15", range: "351-400" },
  { key: "dd16", range: "301-350" },
  { key: "dd17", range: "0-300" },
  { key: "dd18", range: "Total" },
];

function mapCategory(irccCategory) {
  const categoryMappings = [
    { pattern: /provincial nominee program/i, category: "PNP" },
    { pattern: /french language proficiency/i, category: "French" },
    { pattern: /canadian experience class/i, category: "CEC" },
    { pattern: /healthcare/i, category: "Healthcare" },
    { pattern: /trade/i, category: "Trades" },
    { pattern: /stem/i, category: "STEM" },
    { pattern: /transport/i, category: "Transport" },
    { pattern: /agriculture|agri-food/i, category: "Agriculture" },
    { pattern: /^general$/i, category: "General" },
    { pattern: /^education$/i, category: "Education" },
    { pattern: /no program specified|aucun programme spécifié/i, category: null },
  ];

  const match = categoryMappings.find((mapping) =>
    mapping.pattern.test(irccCategory)
  );
  return match ? match.category : null;
}

async function fetchData(urlEn, urlFr) {
  const fetchSingleData = (url) =>
    new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    });

  const [enData, frData] = await Promise.all([fetchSingleData(urlEn), fetchSingleData(urlFr)]);
  return { en: enData, fr: frData };
}

function convertDrawFormat(irccDraw, lang = "en") {
  const cleanDrawSize = irccDraw.drawSize.replace(/[, ]/g, "");
  const cleanDrawCRS = irccDraw.drawCRS.replace(/[, ]/g, "");

  return {
    drawNumber: parseInt(irccDraw.drawNumber, 10),
    date: irccDraw.drawDate,
    invitationsIssued: parseInt(cleanDrawSize, 10),
    minimumCRS: parseInt(cleanDrawCRS, 10),
    category: lang === "fr" ? irccDraw.drawName : mapCategory(irccDraw.drawName),
    year: new Date(irccDraw.drawDate).getFullYear().toString(),
  };
}

function mapDrawDistribution(draw) {
  return {
    drawNumber: parseInt(draw.drawNumber, 10),
    drawDate: draw.drawDate,
    ranges: scoreRanges.map((range) => ({
      key: range.key,
      range: range.range,
      value: draw[range.key] || "0",
    })),
  };
}

async function readJsonFile(path, defaultValue) {
  try {
    const content = await readFile(path, "utf8");
    if (content.trim()) return JSON.parse(content);
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

async function writeJsonFile(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

async function updateDistributionFile(newDistributions) {
  const distributionPath = "./data/distribution.json";
  const existingDistributions = await readJsonFile(distributionPath, []);

  // Filter out distributions that already exist to avoid duplicates
  const existingDrawNumbers = new Set(existingDistributions.map((d) => d.drawNumber));

  const filteredNew = newDistributions.filter((dist) => !existingDrawNumbers.has(dist.drawNumber));

  if (filteredNew.length === 0) {
    console.log("No new distributions to add");
    return;
  }

  const updatedDistributions = [...filteredNew, ...existingDistributions];
  await writeJsonFile(distributionPath, updatedDistributions);
  console.log(`✅ Added ${filteredNew.length} new distribution records`);
}

async function main() {
  try {
    // Load existing English and French data (or initialize)
    const existingDataEn = await readJsonFile("./data/ee-draws.json", { draws: [] });
    const existingDataFr = await readJsonFile("./data/ee-draws-fr.json", { draws: [] });

    const irccData = await fetchData(
      "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json",
      "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_fr.json"
    );

    if (!irccData.en.rounds || irccData.en.rounds.length === 0) {
      console.log("No draws found in IRCC English data");
      return;
    }
    if (!irccData.fr.rounds || irccData.fr.rounds.length === 0) {
      console.log("No draws found in IRCC French data");
      return;
    }

    // Process English draws
    let enAdded = 0;
    const newDistributions = [];

    for (const irccDraw of irccData.en.rounds) {
      const drawNumber = parseInt(irccDraw.drawNumber, 10);
      const exists = existingDataEn.draws.some((d) => d.drawNumber === drawNumber);
      if (!exists) {
        const newDraw = convertDrawFormat(irccDraw);
        existingDataEn.draws.push(newDraw);
        enAdded++;
        newDistributions.push(mapDrawDistribution(irccDraw));
      }
    }

    if (enAdded > 0) {
      existingDataEn.draws.sort((a, b) => b.drawNumber - a.drawNumber);
      await writeJsonFile("./data/ee-draws.json", existingDataEn);
      console.log(`✅ Added ${enAdded} English draws`);
    }

    // Process French draws
    let frAdded = 0;

    for (const irccDraw of irccData.fr.rounds) {
      console.log(parseInt(irccDraw.drawNumber,10));
      const drawNumber = parseInt(irccDraw.drawNumber, 10);
      const exists = existingDataFr.draws.some((d) => d.drawNumber === drawNumber);
      if (!exists) {
        const newDraw = convertDrawFormat(irccDraw, "fr");
        existingDataFr.draws.push(newDraw);
        frAdded++;
      }
    }

    if (frAdded > 0) {
      existingDataFr.draws.sort((a, b) => b.drawNumber - a.drawNumber);
      await writeJsonFile("./data/ee-draws-fr.json", existingDataFr);
      console.log(`✅ Added ${frAdded} French draws`);
    }

    // Update distribution file for English draws only (or French if you uncomment above)
    if (newDistributions.length > 0) {
      await updateDistributionFile(newDistributions);
    } else {
      console.log("No new distributions to update");
    }

    if (enAdded === 0 && frAdded === 0) {
      console.log("No new draws to add");
    } else {
      console.log(`Successfully processed ${enAdded} English and ${frAdded} French draws`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
