// app/server/tests/unit/database.test.js
// 1. Mock the 'knex' library BEFORE requiring the file
jest.mock('knex', () => {
  return jest.fn(() => ({
    destroy: jest.fn(), // Mock common knex methods if needed
  }));
});

const { randomBytes } = require('crypto');

const mockDbPass = randomBytes(12).toString('hex');

// 2. Mock the env variables
jest.mock('../../src/config/env', () => ({
  DB_HOST: 'localhost',
  DB_USER: 'test_user',
  DB_PASS: mockDbPass,
  DB_NAME: 'test_db',
}));

const knex = require('knex');
const db = require('../../src/config/database'); // This triggers the code

describe('Unit: Database Config', () => {
  it('should initialize knex with correct environment variables', () => {
    expect(knex).toHaveBeenCalledWith({
      client: 'pg',
      connection: {
        host: 'localhost',
        user: 'test_user',
        password: mockDbPass,
        database: 'test_db',
      },
      pool: { min: 2, max: 10 },
    });
  });

  it('should export the knex instance', () => {
    expect(db).toBeDefined();
  });
});
