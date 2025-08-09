// Simple compression middleware for JSON responses
const compressResponse = async (c, next) => {
  await next();
  
  // Only compress JSON responses
  const contentType = c.res.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return;
  }
  
  // Get response body
  const response = await c.res.json();
  const jsonString = JSON.stringify(response);
  
  // Simple compression: remove unnecessary whitespace
  const compressed = JSON.stringify(response);
  
  // Update response with compressed data
  c.res = new Response(compressed, {
    status: c.res.status,
    headers: {
      ...Object.fromEntries(c.res.headers.entries()),
      'content-type': 'application/json',
      'content-encoding': 'json-compressed'
    }
  });
};

module.exports = { compressResponse }; 