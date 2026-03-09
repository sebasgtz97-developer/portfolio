// carrier-bids — fetch carrier bid from nuvoOS for a given lane
// GET /api/carrier-bids?carrierId=&originCity=&originState=&originZip=&destCity=&destState=&destZip=&weight=
//
// Requires NUVO_API_TOKEN environment variable.
// Calls GET https://os.nuvocargo.com/api/internal/carriers/:id/bids
// with the minimum required shipment payload.

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    carrierId,
    originCity, originState, originZip = '00000',
    destCity,   destState,   destZip   = '00000',
    weight = '20000',
  } = req.query;

  if (!carrierId)              return res.status(400).json({ error: 'carrierId is required' });
  if (!originCity || !originState) return res.status(400).json({ error: 'originCity and originState are required' });
  if (!destCity   || !destState)   return res.status(400).json({ error: 'destCity and destState are required' });

  const token = process.env.NUVO_API_TOKEN;
  if (!token) return res.status(503).json({ error: 'NUVO_API_TOKEN is not configured' });

  // Build nested query-string params for the nuvoOS bids endpoint.
  // Rails-style bracket notation: shipment[pickup][address][city]=...
  const enc = encodeURIComponent;
  const parts = [
    `shipment[pickup][name]=${enc(originCity)}`,
    `shipment[pickup][address][street]=${enc('1 Main St')}`,
    `shipment[pickup][address][city]=${enc(originCity)}`,
    `shipment[pickup][address][state]=${enc(originState)}`,
    `shipment[pickup][address][zip]=${enc(originZip)}`,
    `shipment[delivery][name]=${enc(destCity)}`,
    `shipment[delivery][address][street]=${enc('1 Main St')}`,
    `shipment[delivery][address][city]=${enc(destCity)}`,
    `shipment[delivery][address][state]=${enc(destState)}`,
    `shipment[delivery][address][zip]=${enc(destZip)}`,
    `shipment[cargo_details][][quantity]=1`,
    `shipment[cargo_details][][type]=pallet`,
    `shipment[cargo_details][][description]=${enc('General Cargo')}`,
    `shipment[cargo_details][][weight]=${enc(weight)}`,
  ];

  const url = `https://os.nuvocargo.com/api/internal/carriers/${enc(carrierId)}/bids?${parts.join('&')}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok) {
      const msg = data.error || data.message || `nuvoOS error ${upstream.status}`;
      return res.status(upstream.status).json({ error: msg });
    }

    // Normalise the response: try common paths for the bid amount.
    // The API docs do not specify the response schema, so we probe the most
    // likely fields and fall back to returning the raw payload.
    let amount = null;
    const probe = data.bid ?? data.amount ?? data.bid_amount ?? data.price ?? data.total_amount ?? data.data;
    if (typeof probe === 'number') {
      amount = probe;
    } else if (probe && typeof probe === 'object') {
      amount = probe.amount ?? probe.total ?? probe.price ?? probe.bid_amount ?? null;
      if (typeof amount === 'string') amount = parseFloat(amount) || null;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ amount, raw: data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
