// Vercel serverless function — query a single shipment from Snowflake.
//
// Required environment variables (set in Vercel project settings):
//   SNOWFLAKE_ACCOUNT    — e.g. "xy12345.us-east-1" or "myorg-myaccount"
//   SNOWFLAKE_USERNAME   — Snowflake user
//   SNOWFLAKE_PASSWORD   — Snowflake password
//   SNOWFLAKE_DATABASE   — e.g. "LOGISTICS_DB"
//   SNOWFLAKE_SCHEMA     — e.g. "PUBLIC"
//   SNOWFLAKE_WAREHOUSE  — e.g. "COMPUTE_WH"
//   SNOWFLAKE_TABLE      — fully-qualified or bare table name, e.g. "SHIPMENTS"
//
// Expected columns in the table (case-insensitive match):
//   SHIPMENT_ID, CARRIER, TRAILER_NUMBER, DELIVERY_APPOINTMENT
//
// GET /api/shipment?id=NUVO-1234
// → 200 { found: true, SHIPMENT_ID, CARRIER, TRAILER_NUMBER, DELIVERY_APPOINTMENT }
// → 404 { found: false }

const snowflake = require('snowflake-sdk');

snowflake.configure({ logLevel: 'error' });

// Module-level connection cache (reused across warm invocations)
let _conn = null;

function connect() {
  return new Promise((resolve, reject) => {
    // Accept full hostname or bare account identifier
    const account = (process.env.SNOWFLAKE_ACCOUNT || '')
      .replace(/\.snowflakecomputing\.com$/i, '');

    const conn = snowflake.createConnection({
      account,
      username:  process.env.SNOWFLAKE_USERNAME,
      password:  process.env.SNOWFLAKE_PASSWORD,
      database:  process.env.SNOWFLAKE_DATABASE,
      schema:    process.env.SNOWFLAKE_SCHEMA,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    });
    conn.connect((err, c) => {
      if (err) return reject(err);
      resolve(c);
    });
  });
}

async function getConn() {
  if (_conn && _conn.isUp()) return _conn;
  _conn = await connect();
  return _conn;
}

function query(conn, sql, binds) {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      },
    });
  });
}

// Normalize a row object so column access is case-insensitive
function col(row, name) {
  return row[name] ?? row[name.toLowerCase()] ?? row[name.toUpperCase()] ?? null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const id = (req.query.id || '').trim().toUpperCase();
  if (!id || id.length < 2) {
    return res.status(400).json({ error: 'id query parameter is required' });
  }

  const table = process.env.SNOWFLAKE_TABLE;
  if (!table) {
    return res.status(500).json({ error: 'SNOWFLAKE_TABLE env var not configured' });
  }

  let conn;
  try {
    conn = await getConn();
  } catch (err) {
    _conn = null;
    console.error('Snowflake connect error:', err.message);
    return res.status(500).json({ error: 'Could not connect to database' });
  }

  try {
    const rows = await query(
      conn,
      `SELECT SHIPMENT_ID, CARRIER, TRAILER_NUMBER, DELIVERY_APPOINTMENT,
              DROPOFF_FACILITY_NAME, DROPOFF_FACILITY_FULL_ADDRESS
       FROM ${table}
       WHERE TRIM(UPPER(SHIPMENT_ID)) = :1
       LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ found: false });
    }

    const r = rows[0];
    return res.status(200).json({
      found:                true,
      SHIPMENT_ID:          col(r, 'SHIPMENT_ID'),
      CARRIER:                       col(r, 'CARRIER'),
      TRAILER_NUMBER:                col(r, 'TRAILER_NUMBER'),
      DELIVERY_APPOINTMENT:          col(r, 'DELIVERY_APPOINTMENT'),
      DROPOFF_FACILITY_NAME:         col(r, 'DROPOFF_FACILITY_NAME'),
      DROPOFF_FACILITY_FULL_ADDRESS: col(r, 'DROPOFF_FACILITY_FULL_ADDRESS'),
    });
  } catch (err) {
    // If the connection went stale, clear cache so next request reconnects
    if (err.code === 'ECONNRESET' || err.message?.includes('not connected')) {
      _conn = null;
    }
    console.error('Snowflake query error:', err.message);
    return res.status(500).json({ error: 'Database query failed' });
  }
};
