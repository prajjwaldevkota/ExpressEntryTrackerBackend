const getApiInfo = (c) => {
  return c.json({
    version: "2.1.0",
    name: "Canada Express Entry Draws API",
    description: "API for accessing Canada Express Entry draw history with bilingual support",
    features: {
      bilingual: "Supports English and French data",
      language_parameter: "Use ?lang=fr for French data, ?lang=en or omit for English",
    },
    endpoints: {
      draws: {
        path: "/api/draws",
        description: "Get all draws with optional year and category filters",
        parameters: ["year", "category", "lang"],
        examples: [
          "/api/draws?year=2024",
          "/api/draws?category=PNP&lang=fr",
          "/api/draws?year=2023&category=CEC&lang=en"
        ],
      },
      latest: {
        path: "/api/draws/latest",
        description: "Get the draw closest to today's date",
        parameters: ["lang"],
        examples: [
          "/api/draws/latest",
          "/api/draws/latest?lang=fr"
        ],
      },
      categories: {
        path: "/api/categories",
        description: "Get all categories",
        parameters: ["lang"],
        examples: [
          "/api/categories",
          "/api/categories?lang=fr"
        ],
      },
      pool: {
        path: "/api/pool",
        description: "Get the pool stats",
      },
      poolProgress: {
        path: "/api/pool/progress",
        description: "Get the pool progress",
      },
    },
    language_support: {
      english: {
        default: true,
        description: "English data with English category codes (PNP, CEC, etc.)",
        example: "/api/draws/latest"
      },
      french: {
        parameter: "?lang=fr",
        description: "French data with French category labels",
        example: "/api/draws/latest?lang=fr"
      }
    },
    data_sources: {
      english: "IRCC English Express Entry Rounds",
      french: "IRCC French Express Entry Rounds"
    }
  });
};

module.exports = {
  getApiInfo,
};
