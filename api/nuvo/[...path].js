// Vercel serverless proxy — forwards requests to os.nuvocargo.com
// Resolves CORS restrictions when the dashboard is served from a different domain.
//
// All requests to /api/nuvo/<anything> are forwarded to
// https://os.nuvocargo.com/<anything> with the original method, headers, and body.

module.exports = async function handler(req, res) {
  // CORS headers — allow the dashboard to call this from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  // Pre-flight
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Reconstruct the upstream path from the catch-all segments
  const segments = req.query.path || [];
  const upstreamPath = '/' + segments.join('/');

  // Forward any query params (excluding the internal `path` key Vercel injects)
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'path') qs.append(k, v);
  }
  const queryString = qs.toString();
  const targetUrl = `https://os.nuvocargo.com${upstreamPath}${queryString ? '?' + queryString : ''}`;

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
    res.setHeader('X-Upstream-URL', targetUrl);
    res.status(upstream.status).end(text);
  } catch (err) {
    res.status(502).json({ error: 'Proxy error', message: err.message, upstream: targetUrl });
  }
};
