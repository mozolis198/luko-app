require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function run() {
  const schemaPath = path.resolve(__dirname, '../src/db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  if (!schemaSql.trim()) {
    throw new Error('Schema file is empty');
  }

  await pool.query(schemaSql);
  console.log('Database migration completed successfully.');
}

run()
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
