// app-v2/server/tests/setup-env.js

// We just assign values here. No imports or validation needed.
process.env.NODE_ENV = 'test';
process.env.PORT = '4000'; // Must be a valid number string to pass validation
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test-jwt-secret-key-123';