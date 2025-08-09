const drawsDataEn = require("../../data/ee-draws.json");
let drawsDataFr;
try {
  drawsDataFr = require("../../data/ee-draws-fr.json");
} catch (error) {
  drawsDataFr = { draws: [] };
}

const getCategories = (c) => {
  const lang = c.req.query("lang") || "en";
  const drawsData = lang === "fr" ? drawsDataFr : drawsDataEn;
  
  const categoryCounts = drawsData.draws.reduce((acc, draw) => {
    if (draw.category) {
      acc[draw.category] = (acc[draw.category] || 0) + 1;
    }
    return acc;
  }, {});

  const sortedCategories = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .map((item) => item.category);

  return c.json({ categories: sortedCategories });
};

module.exports = {
  getCategories,
};
