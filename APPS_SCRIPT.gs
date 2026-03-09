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
        d.qrId,
        lane.rateId        || '',
        d.date,
        d.requester,
        d.shipperName,
        d.commodity,
        lane.originZip     || '',
        lane.originCity,
        lane.originState,
        lane.originCountry,
        lane.bcCity,
        lane.destZip       || '',
        lane.destCity,
        lane.destState,
        lane.destCountry,
        lane.equipType     || '',
        lane.serviceType   || '',
        lane.fuelIncluded  || 'YES',
        lane.nuvoBC        || 'YES',
        lane.numStraps     || 2,
        lane.loadUnloadHrs || 4,
        lane.daysAtBorder  || 3,
        lane.foodGrade     || 'NO',
        lane.fumigation    || 'NO',
        lane.teamDriver    || 'NO',
        lane.targetRate    || '',
        lane.potentialLPM  || '',
        d.notes            || ''
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
