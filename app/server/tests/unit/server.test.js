// app/server/tests/unit/server.test.js
const app = require('../../src/app');
const env = require('../../src/config/env');
const logger = require('../../src/utils/logger');

// Mock dependencies
jest.mock('../../src/app', () => ({
  listen: jest.fn((port, host, callback) => callback()), // auto-call callback
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
}));

describe('Unit: Server Entry Point', () => {
  it('should start the server on the configured port', () => {
    jest.isolateModules(() => {
      require('../../src/server');
      
      expect(app.listen).toHaveBeenCalledWith(
        env.PORT, 
        '0.0.0.0', 
        expect.any(Function)
      );
      
      // Verify the log was called inside the callback
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Server running on port ${env.PORT}`)
      );
    });
  });
});