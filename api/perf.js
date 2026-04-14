const snowflake = require('snowflake-sdk');

snowflake.configure({ logLevel: 'ERROR' });

const SQL = 'SELECT * FROM ANALYTICS.DATA_OPS.PERFORMANCE_DASH';

module.exports = async (req, res) => {
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

    const rows = await new Promise((resolve, reject) =>
      connection.execute({
        sqlText: SQL,
        complete: (err, stmt, rows) => err ? reject(err) : resolve(rows),
      })
    );

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.status(200).json({ rows });
  } catch (err) {
    console.error('[perf]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    connection.destroy(() => {});
  }
};
