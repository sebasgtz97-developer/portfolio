// Vercel serverless function — receives a multi-lane quote request and appends
// each lane as a separate row to a Google Sheet via a Google Apps Script webhook.
//
// SETUP — Google Apps Script (Extensions > Apps Script in your Sheet):
//
//    function doPost(e) {
//      try {
//        var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
//        var d = JSON.parse(e.postData.contents);
//        // Each lane is a separate row
//        var lanes = d.lanes || [d];  // backwards-compat with single-lane
//        lanes.forEach(function(lane) {
//          sheet.appendRow([
//            d.qrId, d.date, d.requester, d.salesRep || '', d.shipperName, d.commodity,
//            lane.rateId || '',
//            lane.originCity, lane.originState, lane.originCountry,
//            lane.bcCity, lane.destCity, lane.destState, lane.destCountry,
//            lane.equipType, lane.serviceType,
//            lane.fuelIncluded, lane.nuvoBC, lane.numStraps, lane.loadUnloadHrs,
//            lane.daysAtBorder, lane.foodGrade, lane.fumigation, lane.teamDriver,
//            lane.targetRate, lane.potentialLPM, d.notes, d.submittedAt
//          ]);
//        });
//        return ContentService
//          .createTextOutput(JSON.stringify({ status: 'ok', lanes: lanes.length }))
//          .setMimeType(ContentService.MimeType.JSON);
//      } catch(err) {
//        return ContentService
//          .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
//          .setMimeType(ContentService.MimeType.JSON);
//      }
//    }
//
// Deploy as web app: Execute as "Me", access "Anyone".
// Set QUOTE_WEBHOOK_URL in Vercel environment variables.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = process.env.QUOTE_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'Quote submission is not configured. Set QUOTE_WEBHOOK_URL in environment variables.',
    });
  }

  const body = req.body;

  // Global required fields
  const globalRequired = ['qrId', 'date', 'requester', 'shipperName', 'commodity'];
  const missing = globalRequired.filter(f => !body[f] || String(body[f]).trim() === '');
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const lanes = body.lanes;
  if (!Array.isArray(lanes) || lanes.length === 0) {
    return res.status(400).json({ error: 'At least one lane is required' });
  }

  // Per-lane required
  const laneRequired = ['originCity', 'originState', 'bcCity', 'destCity', 'destState'];
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    const missingLane = laneRequired.filter(f => !lane[f] || String(lane[f]).trim() === '');
    if (missingLane.length) {
      return res.status(400).json({
        error: `Lane ${i + 1} (${lane.rateId || 'unknown'}) missing: ${missingLane.join(', ')}`,
      });
    }
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!upstream.ok || json.status === 'error') {
      throw new Error(json.message || json.error || `Upstream error ${upstream.status}`);
    }

    return res.status(200).json({
      status: 'ok',
      message: `Quote submitted: ${lanes.length} lane(s)`,
      qrId: body.qrId,
      lanes: lanes.length,
    });
  } catch (err) {
    console.error('Quote webhook error:', err.message);
    return res.status(502).json({ error: 'Failed to submit to Google Sheets', detail: err.message });
  }
};
