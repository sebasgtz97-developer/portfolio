// Diagnostic endpoint — hit /api/quote-health to check the Apps Script webhook URL.
// Returns: whether the env var is set, the URL format, and the raw HTTP response
// from a test GET and POST so you can see what Google returns before any JS logic runs.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const webhookUrl = process.env.QUOTE_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(200).json({ configured: false, error: 'QUOTE_WEBHOOK_URL is not set' });
  }

  // Mask the middle of the URL for logging (keep start + end)
  const maskedUrl = webhookUrl.length > 60
    ? webhookUrl.slice(0, 40) + '…' + webhookUrl.slice(-20)
    : webhookUrl;

  const results = { configured: true, maskedUrl };

  // Test 1: GET with redirect:manual — see the raw redirect
  try {
    const getResp = await fetch(webhookUrl, { method: 'GET', redirect: 'manual' });
    results.get = {
      status: getResp.status,
      location: getResp.headers.get('location'),
      contentType: getResp.headers.get('content-type'),
    };
  } catch (e) {
    results.get = { error: e.message };
  }

  // Test 2: POST with redirect:manual — see what the /exec URL returns before we follow
  try {
    const postResp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _healthCheck: true, lanes: [] }),
      redirect: 'manual',
    });
    const snippet = (await postResp.text().catch(() => '')).substring(0, 200);
    results.post = {
      status: postResp.status,
      location: postResp.headers.get('location'),
      contentType: postResp.headers.get('content-type'),
      bodySnippet: snippet,
    };
  } catch (e) {
    results.post = { error: e.message };
  }

  // Test 3: if POST returned a redirect, follow it manually with POST
  if (results.post?.location) {
    try {
      const followed = await fetch(results.post.location, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _healthCheck: true, lanes: [] }),
        redirect: 'manual',
      });
      const snippet = (await followed.text().catch(() => '')).substring(0, 200);
      results.postFollowed = {
        status: followed.status,
        location: followed.headers.get('location'),
        contentType: followed.headers.get('content-type'),
        bodySnippet: snippet,
      };
    } catch (e) {
      results.postFollowed = { error: e.message };
    }
  }

  return res.status(200).json(results);
};
