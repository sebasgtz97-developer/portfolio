// ─────────────────────────────────────────────────────────────────────────────
// PASTE THIS ENTIRE FILE into Google Apps Script (script.google.com)
// DELETE everything in Code.gs first, then paste this, Save (Ctrl+S),
// then Deploy → Manage deployments → edit existing → "New version" → Deploy
// ─────────────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById('11qEMtIFWxyQNw-1kfqesCFOWdAkDWIEQSulgCQoJd_I');
    var sheet = ss.getSheetByName('QR_RAW2.0');
    var d = JSON.parse(e.postData.contents);
    var lanes = d.lanes || [];

    lanes.forEach(function(lane) {
      sheet.appendRow([
        // ── Global (cols 1–6) ──────────────────────────────────────────────
        d.qrId,                        // 1  QR ID
        lane.rateId        || '',       // 2  Rate ID
        d.date,                        // 3  Date
        d.requester,                   // 4  Requester
        d.shipperName,                 // 5  Shipper Name
        d.commodity,                   // 6  Commodity
        // ── Route (cols 7–15) ─────────────────────────────────────────────
        lane.originZip     || '',       // 7  Origin ZIP
        lane.originCity,               // 8  Origin City
        lane.originState,              // 9  Origin State
        lane.originCountry,            // 10 Origin Country
        lane.bcCity,                   // 11 BC City
        lane.destZip       || '',       // 12 Dest ZIP
        lane.destCity,                 // 13 Dest City
        lane.destState,                // 14 Dest State
        lane.destCountry,              // 15 Dest Country
        // ── Equipment (cols 16–17) ────────────────────────────────────────
        lane.equipType     || '',       // 16 Equip Type
        lane.serviceType   || '',       // 17 Service Type
        // ── Operational flags (cols 18–25) ───────────────────────────────
        lane.fuelIncluded  || 'YES',    // 18 Fuel Included
        lane.nuvoBC        || 'YES',    // 19 Nuvo BC
        lane.foodGrade     || 'NO',     // 20 Food Grade
        lane.fumigation    || 'NO',     // 21 Fumigation
        lane.teamDriver    || 'NO',     // 22 Team Driver
        lane.leakproof     || 'NO',     // 23 Leakproof
        lane.liftGate      || 'NO',     // 24 Lift Gate
        lane.airRide       || 'NO',     // 25 Air Ride Suspension
        lane.modernUnit    || 'NO',     // 26 Modern Unit
        lane.swingDoor     || 'NO',     // 27 Swing Door
        lane.twicCard      || 'NO',     // 28 TWIC Card
        lane.tankerEndorsed || 'NO',    // 29 Tanker Endorsed
        lane.hazmatEndorsed || 'NO',    // 30 Hazmat Endorsed
        // ── Numeric requirements (cols 31–34) ────────────────────────────
        lane.numStraps     || 2,        // 31 # of Straps
        lane.loadUnloadHrs || 4,        // 32 Load/Unload Hrs
        lane.daysAtBorder  || 3,        // 33 Days at Border
        lane.numLoadBars   || 0,        // 34 # of Load Bars
        lane.numTarps      || 0,        // 35 # of Tarps
        // ── Pricing (cols 36–39) ──────────────────────────────────────────
        lane.targetRate    || '',       // 36 Target Rate
        lane.potentialLPM  || '',       // 37 Potential LPM
        lane.shipmentValue || 100000,   // 38 Shipment Value (USD)
        lane.shipmentWeight || 45000,   // 39 Shipment Weight (lbs)
        // ── Notes (col 40) ────────────────────────────────────────────────
        d.notes            || '',       // 40 Notes
        // ── Stops (col 41) ────────────────────────────────────────────────
        lane.stops         || ''        // 41 Stop ZIPs (pipe-separated)
      ]);
    });

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', lanes: lanes.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
