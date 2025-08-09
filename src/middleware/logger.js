// Cloudflare Workers optimized request logging
const requestLogger = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  
  try {
    await next();
    const duration = Date.now() - start;
    
    // Log successful requests (Cloudflare will handle console output)
    console.log(`[${new Date().toISOString()}] ${method} ${path} - ${c.res.status} (${duration}ms)`);
    
    // Add performance headers
    c.header('X-Response-Time', `${duration}ms`);
    c.header('X-Cache-Hit', c.res.headers.get('X-Cache-Hit') || 'false');
    
    // Record performance stats
    performanceStats.recordRequest(duration, c.res.headers.get('X-Cache-Hit') === 'true');
    
  } catch (error) {
    const duration = Date.now() - start;
    console.error(`[${new Date().toISOString()}] ${method} ${path} - ERROR (${duration}ms):`, error.message);
    throw error;
  }
};

// Performance monitoring
const performanceStats = {
  requests: 0,
  totalTime: 0,
  cacheHits: 0,
  cacheMisses: 0,
  
  recordRequest(duration, cacheHit = false) {
    this.requests++;
    this.totalTime += duration;
    if (cacheHit) this.cacheHits++;
    else this.cacheMisses++;
  },
  
  getStats() {
    return {
      totalRequests: this.requests,
      averageResponseTime: this.requests > 0 ? this.totalTime / this.requests : 0,
      cacheHitRate: this.requests > 0 ? (this.cacheHits / this.requests) * 100 : 0,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses
    };
  }
};

export { requestLogger, performanceStats }; 