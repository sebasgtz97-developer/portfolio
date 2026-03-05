// Vercel serverless function — receives a quote request and appends it to
// a Google Sheet via a Google Apps Script web app (webhook).
//
// SETUP:
// 1. In your Google Sheet, open Extensions > Apps Script and paste:
//
//    function doPost(e) {
//      try {
//        var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
//        var d = JSON.parse(e.postData.contents);
//        sheet.appendRow([
//          d.qrId, d.date, d.requester, d.shipperName, d.commodity,
//          d.originCity, d.originState, d.originCountry,
//          d.bcCity, d.destCity, d.destState, d.destCountry,
//          d.equipType, d.serviceType,
//          d.fuelIncluded, d.nuvoBC, d.numStraps, d.loadUnloadHrs,
//          d.daysAtBorder, d.foodGrade, d.fumigation, d.teamDriver,
//          d.targetRate, d.potentialLPM, d.notes, d.submittedAt
//        ]);
//        return ContentService
//          .createTextOutput(JSON.stringify({ status: 'ok' }))
//          .setMimeType(ContentService.MimeType.JSON);
//      } catch(err) {
//        return ContentService
//          .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
//          .setMimeType(ContentService.MimeType.JSON);
//      }
//    }
//
// 2. Deploy as a web app: Execute as "Me", Who has access "Anyone"
// 3. Copy the deployment URL and set it as QUOTE_WEBHOOK_URL in Vercel env vars

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const webhookUrl = process.env.QUOTE_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'Quote submission is not configured. Set the QUOTE_WEBHOOK_URL environment variable.',
    });
  }

  const body = req.body;

  // Basic server-side validation
  const required = [
    'qrId', 'date', 'requester', 'shipperName', 'commodity',
    'originCity', 'originState', 'originCountry',
    'bcCity', 'destCity', 'destState', 'destCountry',
    'equipType', 'serviceType',
  ];

  const missing = required.filter(f => !body[f] || String(body[f]).trim() === '');
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (!/^\d+$/.test(String(body.qrId).trim())) {
    return res.status(400).json({ error: 'qrId must be numeric' });
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

    return res.status(200).json({ status: 'ok', message: 'Quote submitted successfully' });
  } catch (err) {
    console.error('Quote webhook error:', err.message);
    return res.status(502).json({ error: 'Failed to submit to Google Sheets', detail: err.message });
  }
};
