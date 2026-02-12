const knex = require('knex');
const env = require('../../config/env');

const db = knex({
  client: 'pg',
  connection: {
    host: env.DB_HOST,
    user: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
  },
  pool: { min: 2, max: 10 },
});

module.exports = db;
