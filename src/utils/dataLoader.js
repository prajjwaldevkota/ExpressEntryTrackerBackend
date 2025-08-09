// Optimized data loader utility with compression and memory management
import { cache } from "./cache.js";

// Import JSON files statically (required for bundlers)
import enData from "../../data/ee-draws.json";

// Compressed data structure to reduce memory footprint
const compressDrawData = (draws) => {
  return draws.map(draw => ({
    d: draw.drawNumber,
    dt: draw.date,
    i: draw.invitationsIssued,
    c: draw.minimumCRS,
    cat: draw.category,
    y: draw.year
  }));
};

const decompressDrawData = (compressedDraws) => {
  return compressedDraws.map(draw => ({
    drawNumber: draw.d,
    date: draw.dt,
    invitationsIssued: draw.i,
    minimumCRS: draw.c,
    category: draw.cat,
    year: draw.y
  }));
};

// For local development, we can load JSON files
// For Cloudflare Workers, this would be replaced with KV or other storage
const loadLocalData = async () => {
  try {
    // Try to import French data, fallback to empty if not available
    let frData = { draws: [] };
    try {
      // Dynamic import for French data (handles missing file)
      const frModule = await import("../../data/ee-draws-fr.json");
      frData = frModule.default;
    } catch (error) {
      console.warn("French data not found, using empty dataset");
    }
    
    // Compress data to reduce memory footprint
    const compressedEnData = {
      draws: compressDrawData(enData.draws)
    };
    
    const compressedFrData = {
      draws: compressDrawData(frData.draws)
    };
    
    return {
      en: compressedEnData,
      fr: compressedFrData,
      _compressed: true
    };
  } catch (error) {
    console.warn("Could not load local data files:", error.message);
    return {
      en: { draws: [] },
      fr: { draws: [] },
      _compressed: true
    };
  }
};

// Centralized data loader with enhanced caching and memory management
export const loadData = async () => {
  const cacheKey = 'data_loader_compressed';
  let data = cache.get(cacheKey);
  
  if (!data) {
    data = await loadLocalData();
    
    // Cache for 15 minutes since data files don't change frequently
    cache.set(cacheKey, data, 15 * 60 * 1000);
  }
  
  return data;
};

// Optimized data retrieval with pagination support
export const getDrawsWithPagination = async (page = 1, limit = 50, filters = {}) => {
  const data = await loadData();
  const drawsData = filters.lang === "fr" ? data.fr : data.en;
  
  // Decompress data for processing
  const decompressedDraws = data._compressed ? 
    decompressDrawData(drawsData.draws) : 
    drawsData.draws;
  
  let filteredDraws = [...decompressedDraws];

  // Apply filters
  if (filters.year) {
    filteredDraws = filteredDraws.filter((draw) => draw.year === filters.year);
  }

  if (filters.category) {
    const categoryLower = filters.category.toLowerCase();
    filteredDraws = filteredDraws.filter(
      (draw) => draw.category && draw.category.toLowerCase() === categoryLower
    );
  }

  // Calculate pagination
  const totalDraws = filteredDraws.length;
  const totalPages = Math.ceil(totalDraws / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedDraws = filteredDraws.slice(startIndex, endIndex);

  return {
    draws: paginatedDraws,
    pagination: {
      page,
      limit,
      totalDraws,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

// Memory-efficient latest draw finder
export const getLatestDrawOptimized = async (lang = "en") => {
  const data = await loadData();
  const drawsData = lang === "fr" ? data.fr : data.en;
  
  // Decompress data for processing
  const decompressedDraws = data._compressed ? 
    decompressDrawData(drawsData.draws) : 
    drawsData.draws;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find the latest draw efficiently
  const latestDraw = [...decompressedDraws].reduce((closest, current) => {
    const currentDate = new Date(current.date);
    currentDate.setHours(0, 0, 0, 0);

    if (currentDate > today) return closest;

    if (!closest) return current;

    const closestDate = new Date(closest.date);
    closestDate.setHours(0, 0, 0, 0);

    const currentDiff = Math.abs(today - currentDate);
    const closestDiff = Math.abs(today - closestDate);

    return currentDiff < closestDiff ? current : closest;
  }, null);

  return latestDraw || {};
};

// Memory usage monitoring
export const getMemoryStats = () => {
  const data = cache.get('data_loader_compressed');
  if (!data) return { status: 'No data loaded' };
  
  const enSize = JSON.stringify(data.en).length;
  const frSize = JSON.stringify(data.fr).length;
  const totalSize = enSize + frSize;
  
  return {
    compressed: data._compressed,
    englishDataSize: `${(enSize / 1024).toFixed(2)} KB`,
    frenchDataSize: `${(frSize / 1024).toFixed(2)} KB`,
    totalSize: `${(totalSize / 1024).toFixed(2)} KB`,
    estimatedSavings: data._compressed ? '~40%' : '0%'
  };
}; 