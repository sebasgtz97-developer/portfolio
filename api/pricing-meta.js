// pricing-meta — returns distinct route cities/states from PERFORMANCE_DASH
// Cached 1 hour; used to populate Pricing Insights comboboxes.
const snowflake = require('snowflake-sdk');
snowflake.configure({ logLevel: 'ERROR' });

function createConn() {
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

function query(conn, sql) {
  return new Promise((resolve, reject) =>
    conn.execute({ sqlText: sql, complete: (err, _s, rows) => err ? reject(err) : resolve(rows || []) })
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const conn = createConn();
  try {
    await new Promise((resolve, reject) =>
      conn.connect((err, c) => err ? reject(err) : resolve(c))
    );

    const [originRows, destRows] = await Promise.all([
      query(conn, `
        SELECT DISTINCT
          TRIM(ORIGIN_CITY)  AS CITY,
          TRIM(ORIGIN_STATE) AS STATE
        FROM ANALYTICS.DATA_OPS.PERFORMANCE_DASH
        WHERE ORIGIN_CITY IS NOT NULL
          AND TRIM(ORIGIN_CITY) <> ''
        ORDER BY CITY
        LIMIT 800
      `),
      query(conn, `
        SELECT DISTINCT
          TRIM(DESTINATION_CITY)  AS CITY,
          TRIM(DESTINATION_STATE) AS STATE
        FROM ANALYTICS.DATA_OPS.PERFORMANCE_DASH
        WHERE DESTINATION_CITY IS NOT NULL
          AND TRIM(DESTINATION_CITY) <> ''
        ORDER BY CITY
        LIMIT 800
      `),
    ]);

    const unique = (arr) => [...new Set(arr.filter(Boolean))].sort();

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({
      originCities:  unique(originRows.map(r => r.CITY)),
      originStates:  unique(originRows.map(r => r.STATE)),
      destCities:    unique(destRows.map(r => r.CITY)),
      destStates:    unique(destRows.map(r => r.STATE)),
    });
  } catch (err) {
    console.error('[pricing-meta]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.destroy(() => {});
  }
};
