const knex = require('knex');
const { createKnexConfig } = require('./knex-config');

const db = knex(createKnexConfig());

module.exports = db;
