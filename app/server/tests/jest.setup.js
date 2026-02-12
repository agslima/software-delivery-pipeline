// Inject generated secrets so the app config passes validation during tests
const { randomUUID, randomBytes } = require('crypto');

process.env.NODE_ENV = 'test';

// Auth Config
process.env.ADMIN_USER = process.env.ADMIN_USER || `admin-${randomUUID()}`;
process.env.ADMIN_PASS = process.env.ADMIN_PASS || `admin-${randomUUID()}!`;
process.env.JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGIN = 'http://localhost';
process.env.DATA_ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || randomBytes(32).toString('hex');

process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_USER = process.env.DB_USER || `dbuser-${randomUUID()}`;
process.env.DB_PASS = process.env.DB_PASS || randomBytes(16).toString('hex');
process.env.DB_NAME = process.env.DB_NAME || `db-${randomUUID()}`;
