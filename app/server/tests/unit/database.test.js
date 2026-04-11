// app/server/tests/unit/database.test.js
// 1. Mock the 'knex' library BEFORE requiring the file
jest.mock('knex', () => {
  return jest.fn(() => ({
    destroy: jest.fn(), // Mock common knex methods if needed
  }));
});

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

const { randomBytes } = require('crypto');

const mockDbPass = randomBytes(12).toString('hex');

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USER = 'test_user';
process.env.DB_PASS = mockDbPass;
process.env.DB_NAME = 'test_db';

const knex = require('knex');
const db = require('../../src/config/database'); // This triggers the code

describe('Unit: Database Config', () => {
  it('should initialize knex with correct environment variables', () => {
    expect(knex).toHaveBeenCalledWith(
      expect.objectContaining({
        client: 'pg',
        connection: {
          host: 'localhost',
          port: 5432,
          user: 'test_user',
          password: mockDbPass,
          database: 'test_db',
        },
        pool: { min: 2, max: 10 },
        migrations: expect.objectContaining({
          tableName: 'knex_migrations',
        }),
        seeds: expect.any(Object),
      })
    );
  });

  it('should export the knex instance', () => {
    expect(db).toBeDefined();
  });
});
