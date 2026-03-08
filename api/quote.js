// Vercel serverless function — receives a multi-lane quote request and appends
// each lane as a separate row to the Google Sheet via a Google Apps Script webhook.
//
// ─── GOOGLE APPS SCRIPT SETUP ───────────────────────────────────────────────
// 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/18QrUBOPT6NQjtoTwhNgtH4zaSvTPPwar6syoJS661ic
// 2. Click Extensions → Apps Script
// 3. Replace everything with the code below, then click Save (Ctrl+S)
// 4. Click Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy the Web App URL → add it as QUOTE_WEBHOOK_URL in Vercel environment vars
//
// ─────────────────────────────────────────────────────────────────────────────
//  function doPost(e) {
//    try {
//      var ss = SpreadsheetApp.openById('18QrUBOPT6NQjtoTwhNgtH4zaSvTPPwar6syoJS661ic');
//      var sheet = ss.getSheets()[0];
//      var d = JSON.parse(e.postData.contents);
//      var lanes = d.lanes || [];
//      lanes.forEach(function(lane) {
//        // Columns match the sheet header exactly:
//        // Date | Requester | Shipper | Commodity Description |
//        // Origin City | Origin State | Origin Country | BC City |
//        // Destination City | Destination State | Destination Country |
//        // Equipment Type | Service Type |
//        // Fuel Included? | Nuvo BC? | # of Straps | Load/Unload Hrs | Days at Border |
//        // Food Grade? | Fumigation? | Team Driver Required? |
//        // Target Rate | Potential LPM (Lane) | Notes
//        sheet.appendRow([
//          d.date,
//          d.requester,
//          d.shipperName,
//          d.commodity,
//          lane.originCity,
//          lane.originState,
//          lane.originCountry,
//          lane.bcCity,
//          lane.destCity,
//          lane.destState,
//          lane.destCountry,
//          lane.equipType  || '',
//          lane.serviceType || '',
//          lane.fuelIncluded || 'YES',
//          lane.nuvoBC      || 'YES',
//          lane.numStraps   || 2,
//          lane.loadUnloadHrs || 4,
//          lane.daysAtBorder  || 3,
//          lane.foodGrade   || 'NO',
//          lane.fumigation  || 'NO',
//          lane.teamDriver  || 'NO',
//          lane.targetRate  || '',
//          lane.potentialLPM || '',
//          d.notes || ''
//        ]);
//      });
//      return ContentService
//        .createTextOutput(JSON.stringify({ status: 'ok', lanes: lanes.length }))
//        .setMimeType(ContentService.MimeType.JSON);
//    } catch(err) {
//      return ContentService
//        .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
//        .setMimeType(ContentService.MimeType.JSON);
//    }
//  }
// ─────────────────────────────────────────────────────────────────────────────
//
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
