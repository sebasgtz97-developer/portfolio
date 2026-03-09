// carrier-bids — fetch all carrier bids from nuvoOS for a given lane
// GET /api/carrier-bids?originCity=&originState=&originZip=&destCity=&destState=&destZip=&weight=
//
// Requires NUVO_API_TOKEN environment variable.
// Calls GET https://os.nuvocargo.com/api/internal/bids with a lane payload
// and returns aggregated bid data (average, min, max, count).

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const {
    originCity, originState, originZip = '00000',
    destCity,   destState,   destZip   = '00000',
    weight = '20000',
  } = req.query;

  if (!originCity || !originState) return res.status(400).json({ error: 'originCity and originState are required' });
  if (!destCity   || !destState)   return res.status(400).json({ error: 'destCity and destState are required' });

  const token = process.env.NUVO_API_TOKEN;
  if (!token) return res.status(503).json({ error: 'NUVO_API_TOKEN is not configured' });

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

  // Lane-level bids endpoint — returns bids from all carriers for this lane
  const url = `https://os.nuvocargo.com/api/internal/bids?${parts.join('&')}`;

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

    // Normalise: the response may be an array of bids or an object wrapping one
    const bidsArr = Array.isArray(data)         ? data
                  : Array.isArray(data.bids)    ? data.bids
                  : Array.isArray(data.data)    ? data.data
                  : [];

    // Extract numeric amount from each bid object
    const amounts = bidsArr
      .map(b => {
        const v = b.amount ?? b.bid_amount ?? b.price ?? b.total_amount ?? b.total ?? null;
        return typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || null : null);
      })
      .filter(v => v !== null && v > 0);

    let average = null, min = null, max = null;
    if (amounts.length) {
      average = Math.round(amounts.reduce((s, v) => s + v, 0) / amounts.length);
      min = Math.min(...amounts);
      max = Math.max(...amounts);
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ average, min, max, count: amounts.length, raw: data });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
