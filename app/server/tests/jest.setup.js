// Inject "Dummy" secrets so the app config passes validation during tests
process.env.NODE_ENV = 'test';

// Auth Config
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'test_password';
process.env.JWT_SECRET = 'test_secret_key';
process.env.LOG_LEVEL = 'silent'; 
process.env.CORS_ORIGIN = 'http://localhost';

process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test_user';
process.env.DB_PASS = 'test_pass';
process.env.DB_NAME = 'test_db';