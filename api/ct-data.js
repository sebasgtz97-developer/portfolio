// Control Tower — Snowflake data API
// Returns active + historical shipment data for the customer-facing dashboard.
//
// GET /api/ct-data
//   ?company=<shipper name>   — optional, filter by shipper/customer name
//   &days=30                  — optional, history window in days (default 30)
//
// Returns: { rows: [...], columns: [...] }

const snowflake = require('snowflake-sdk');
snowflake.configure({ logLevel: 'ERROR' });

const ACTIVE_SQL = 'SELECT * FROM ANALYTICS.data_ops_snow2sheets.MONITORING_REPORT';

function createConnection() {
  const account = (process.env.SNOWFLAKE_ACCOUNT || '')
    .replace(/\.snowflakecomputing\.com$/i, '');
  return snowflake.createConnection({
    account,
    username:  process.env.SNOWFLAKE_USERNAME,
    password:  process.env.SNOWFLAKE_PASSWORD,
    database:  process.env.SNOWFLAKE_DATABASE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    schema:    process.env.SNOWFLAKE_SCHEMA,
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const connection = createConnection();

  try {
    await new Promise((resolve, reject) =>
      connection.connect((err, conn) => err ? reject(err) : resolve(conn))
    );

    const rows = await new Promise((resolve, reject) =>
      connection.execute({
        sqlText: ACTIVE_SQL,
        complete: (err, _stmt, rows) => err ? reject(err) : resolve(rows || []),
      })
    );

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json({ rows, columns: rows.length ? Object.keys(rows[0]) : [] });
  } catch (err) {
    console.error('[ct-data]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.destroy(() => {});
  }
};
