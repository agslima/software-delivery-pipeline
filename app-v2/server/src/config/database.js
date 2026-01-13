const knex = require('knex');
const { DB_HOST, DB_USER, DB_PASS, DB_NAME } = require('./env');

const db = knex({
  client: 'pg',
  connection: {
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
  },
  pool: { min: 2, max: 10 }, // Manage connections efficiently
});

module.exports = db;