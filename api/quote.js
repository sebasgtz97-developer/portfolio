// Vercel serverless function — appends quote lanes directly to Google Sheets
// via the Sheets API using a service account. No Apps Script web app needed.
//
// ─── SETUP ───────────────────────────────────────────────────────────────────
// 1. Go to console.cloud.google.com → create/select a project
// 2. Enable the "Google Sheets API"
// 3. Create a Service Account (IAM & Admin → Service Accounts → Create)
// 4. Generate a JSON key for it (Actions → Manage keys → Add key → JSON)
// 5. Open the Google Sheet and share it (Editor) with the service account email
//    (looks like: name@project.iam.gserviceaccount.com)
// 6. In Vercel: add env var GOOGLE_SERVICE_ACCOUNT_JSON = <full contents of JSON key>
// ─────────────────────────────────────────────────────────────────────────────

const { google } = require('googleapis');

const SPREADSHEET_ID = '11qEMtIFWxyQNw-1kfqesCFOWdAkDWIEQSulgCQoJd_I';
const SHEET_NAME     = 'QR_RAW2.0';

// Columns match APPS_SCRIPT.gs exactly (40 cols + stops = 41 total)
function laneToRow(d, lane) {
  return [
    d.qrId,                        // 1  QR ID
    lane.rateId        || '',       // 2  Rate ID
    d.date,                        // 3  Date
    d.requester,                   // 4  Requester
    d.shipperName,                 // 5  Shipper Name
    d.commodity,                   // 6  Commodity
    lane.originZip     || '',       // 7  Origin ZIP
    lane.originCity,               // 8  Origin City
    lane.originState,              // 9  Origin State
    lane.originCountry || '',       // 10 Origin Country
    lane.bcCity,                   // 11 BC City
    lane.destZip       || '',       // 12 Dest ZIP
    lane.destCity,                 // 13 Dest City
    lane.destState,                // 14 Dest State
    lane.destCountry   || '',       // 15 Dest Country
    lane.equipType     || '',       // 16 Equip Type
    lane.serviceType   || '',       // 17 Service Type
    lane.fuelIncluded  || 'YES',    // 18 Fuel Included
    lane.nuvoBC        || 'YES',    // 19 Nuvo BC
    lane.foodGrade     || 'NO',     // 20 Food Grade
    lane.fumigation    || 'NO',     // 21 Fumigation
    lane.teamDriver    || 'NO',     // 22 Team Driver
    lane.leakproof     || 'NO',     // 23 Leakproof
    lane.liftGate      || 'NO',     // 24 Lift Gate
    lane.airRide       || 'NO',     // 25 Air Ride
    lane.modernUnit    || 'NO',     // 26 Modern Unit
    lane.swingDoor     || 'NO',     // 27 Swing Door
    lane.twicCard      || 'NO',     // 28 TWIC Card
    lane.tankerEndorsed || 'NO',    // 29 Tanker Endorsed
    lane.hazmatEndorsed || 'NO',    // 30 Hazmat Endorsed
    lane.numStraps     || 2,        // 31 # of Straps
    lane.loadUnloadHrs || 4,        // 32 Load/Unload Hrs
    lane.daysAtBorder  || 3,        // 33 Days at Border
    lane.numLoadBars   || 0,        // 34 # of Load Bars
    lane.numTarps      || 0,        // 35 # of Tarps
    lane.targetRate    || '',       // 36 Target Rate
    lane.potentialLPM  || '',       // 37 Potential LPM
    lane.shipmentValue || 100000,   // 38 Shipment Value (USD)
    lane.shipmentWeight || 45000,   // 39 Shipment Weight (lbs)
    d.notes            || '',       // 40 Notes
    lane.stops         || '',       // 41 Stop ZIPs
  ];
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    return res.status(503).json({
      error: 'Quote submission is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON in environment variables.',
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
    const credentials = JSON.parse(saJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const rows = lanes.map(lane => laneToRow(body, lane));

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });

    return res.status(200).json({
      status: 'ok',
      message: `Quote submitted: ${lanes.length} lane(s)`,
      qrId: body.qrId,
      lanes: lanes.length,
    });
  } catch (err) {
    console.error('Sheets API error:', err.message);
    return res.status(502).json({ error: 'Failed to submit to Google Sheets', detail: err.message });
  }
};
