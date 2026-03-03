// Vercel serverless proxy — forwards requests to os.nuvocargo.com
// Resolves CORS restrictions when the dashboard is served from a different domain.
//
// Usage: GET/POST/PATCH /api/proxy?p=/api/internal/whatever
// The `p` query param is the upstream path on os.nuvocargo.com.

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const upstreamPath = req.query.p || '';
  if (!upstreamPath.startsWith('/')) {
    return res.status(400).json({ error: 'Missing or invalid ?p= path parameter' });
  }

  const targetUrl = `https://os.nuvocargo.com${upstreamPath}`;

  const fetchOptions = {
    method: req.method,
    headers: {
      'Authorization': req.headers.authorization || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (!['GET', 'HEAD'].includes(req.method) && req.body) {
    fetchOptions.body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(targetUrl, fetchOptions);
    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.status(upstream.status).end(text);
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', message: err.message, upstream: targetUrl });
  }
};
