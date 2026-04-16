const { Pool } = require('pg');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const needsSsl = /render\.com/i.test(databaseUrl) || /sslmode=require/i.test(databaseUrl) || process.env.DB_SSL === 'true';

const pool = new Pool({
  connectionString: databaseUrl,
  ...(needsSsl
    ? {
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : {}),
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

const query = (text, params) => pool.query(text, params);

module.exports = {
  pool,
  query,
};
