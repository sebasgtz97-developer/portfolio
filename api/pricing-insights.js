// pricing-insights — monthly freight cost history for a given lane
// GET /api/pricing-insights?originCity=&originState=&destCity=&destState=
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

function query(conn, sql, binds) {
  return new Promise((resolve, reject) =>
    conn.execute({
      sqlText: sql,
      binds: binds || [],
      complete: (err, _s, rows) => err ? reject(err) : resolve(rows || []),
    })
  );
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { originCity, originState, destCity, destState } = req.query;
  if (!originCity || !originState || !destCity || !destState) {
    return res.status(400).json({ error: 'originCity, originState, destCity, destState are all required' });
  }

  const conn = createConn();
  try {
    await new Promise((resolve, reject) =>
      conn.connect((err, c) => err ? reject(err) : resolve(c))
    );

    // Step 1: discover column names from INFORMATION_SCHEMA in one query
    const metaCols = await query(conn, `
      SELECT COLUMN_NAME
      FROM ANALYTICS.INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'DATA_OPS'
        AND TABLE_NAME   = 'PERFORMANCE_DASH'
        AND (
          LOWER(COLUMN_NAME) LIKE '%picked_up%'
          OR LOWER(COLUMN_NAME) LIKE '%pickup_date%'
          OR LOWER(COLUMN_NAME) LIKE '%pick_up%'
          OR LOWER(COLUMN_NAME) LIKE '%dropoff_stop%'
          OR LOWER(COLUMN_NAME) LIKE '%stop_one%'
        )
    `);

    // Partition discovered columns by purpose
    const dateCol  = metaCols.find(r => /picked.up|pickup.date|pick.up/i.test(r.COLUMN_NAME));
    const stopCol  = metaCols.find(r => /dropoff.stop|stop.one/i.test(r.COLUMN_NAME));

    let dateExpr;
    if (dateCol) {
      dateExpr = `TRY_TO_DATE(TRIM("${dateCol.COLUMN_NAME}"))`;
    } else {
      dateExpr = `COALESCE(
        TRY_TO_DATE(TRIM(ACTUAL_DELIVERY_DATE)),
        TRY_TO_DATE(TRIM(SHIP_DATE)),
        TRY_TO_DATE(TRIM(CREATED_DATE))
      )`;
    }

    // Optional stop-city filter — exclude shipments with a dropoff stop
    const stopFilter = stopCol
      ? `AND ("${stopCol.COLUMN_NAME}" IS NULL OR TRIM("${stopCol.COLUMN_NAME}") = '')`
      : '';

    // Step 2: monthly freight cost query
    const sql = `
      SELECT
        DATE_TRUNC('month', ${dateExpr}) AS MONTH,
        ROUND(AVG(FREIGHT_COST), 2)      AS AVG_FREIGHT_COST,
        ROUND(MIN(FREIGHT_COST), 2)      AS MIN_FREIGHT_COST,
        ROUND(MAX(FREIGHT_COST), 2)      AS MAX_FREIGHT_COST,
        COUNT(*)                          AS SHIPMENT_COUNT
      FROM ANALYTICS.DATA_OPS.PERFORMANCE_DASH
      WHERE
        UPPER(TRIM(ORIGIN_CITY))           = UPPER(TRIM(:1))
        AND UPPER(TRIM(ORIGIN_STATE))      = UPPER(TRIM(:2))
        AND UPPER(TRIM(DESTINATION_CITY))  = UPPER(TRIM(:3))
        AND UPPER(TRIM(DESTINATION_STATE)) = UPPER(TRIM(:4))
        AND ${dateExpr} IS NOT NULL
        AND FREIGHT_COST IS NOT NULL
        AND FREIGHT_COST > 0
        ${stopFilter}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const rows = await query(conn, sql, [originCity, originState, destCity, destState]);

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({
      rows,
      dateColumn: dateCol ? dateCol.COLUMN_NAME : null,
      stopColumn: stopCol ? stopCol.COLUMN_NAME : null,
    });
  } catch (err) {
    console.error('[pricing-insights]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    conn.destroy(() => {});
  }
};
