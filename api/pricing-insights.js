const snowflake = require('snowflake-sdk');

snowflake.configure({ logLevel: 'ERROR' });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { originCity, originState, destCity, destState } = req.query;

  if (!originCity || !originState || !destCity || !destState) {
    return res.status(400).json({
      error: 'originCity, originState, destCity, destState are all required',
    });
  }

  const account = (process.env.SNOWFLAKE_ACCOUNT || '')
    .replace(/\.snowflakecomputing\.com$/i, '');

  const connection = snowflake.createConnection({
    account,
    username:  process.env.SNOWFLAKE_USERNAME,
    password:  process.env.SNOWFLAKE_PASSWORD,
    database:  process.env.SNOWFLAKE_DATABASE,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    schema:    process.env.SNOWFLAKE_SCHEMA,
  });

  try {
    await new Promise((resolve, reject) =>
      connection.connect((err, conn) => err ? reject(err) : resolve(conn))
    );

    // Group by month, return avg/min/max freight cost + shipment count
    const sql = `
      SELECT
        DATE_TRUNC('month', TRY_TO_DATE(TRIM("_ACTUAL_PICKED_UP_FROM_ORIGIN__"))) AS MONTH,
        ROUND(AVG("FREIGHT_COST"), 2)   AS AVG_FREIGHT_COST,
        ROUND(MIN("FREIGHT_COST"), 2)   AS MIN_FREIGHT_COST,
        ROUND(MAX("FREIGHT_COST"), 2)   AS MAX_FREIGHT_COST,
        COUNT(*)                         AS SHIPMENT_COUNT
      FROM ANALYTICS.DATA_OPS.PERFORMANCE_DASH
      WHERE
        UPPER(TRIM("ORIGIN_CITY"))        = UPPER(TRIM(:1))
        AND UPPER(TRIM("ORIGIN_STATE"))   = UPPER(TRIM(:2))
        AND UPPER(TRIM("DESTINATION_CITY"))  = UPPER(TRIM(:3))
        AND UPPER(TRIM("DESTINATION_STATE")) = UPPER(TRIM(:4))
        AND TRY_TO_DATE(TRIM("_ACTUAL_PICKED_UP_FROM_ORIGIN__")) IS NOT NULL
        AND "FREIGHT_COST" IS NOT NULL
        AND "FREIGHT_COST" > 0
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const rows = await new Promise((resolve, reject) =>
      connection.execute({
        sqlText: sql,
        binds: [originCity, originState, destCity, destState],
        complete: (err, stmt, rows) => err ? reject(err) : resolve(rows),
      })
    );

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ rows });
  } catch (err) {
    console.error('[pricing-insights]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.destroy(() => {});
  }
};
