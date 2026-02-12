// app/server/tests/unit/middlewares.test.js
const validate = require('../../src/middlewares/validate.middleware');
const errorHandler = require('../../src/middlewares/error-handler.middleware');
const logger = require('../../src/utils/logger');

// Mock Logger to prevent noise in test output
jest.mock('../../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Unit: Middlewares', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset Mocks
    req = { body: {}, originalUrl: '/test', method: 'GET', id: '123' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  // --- Validate Middleware Tests ---
  describe('validate.middleware', () => {
    it('should call next() if validation passes', () => {
      // Mock a Joi-like schema that succeeds
      const mockSchema = {
        validate: jest.fn().mockReturnValue({ error: null }),
      };

      const middleware = validate(mockSchema);
      middleware(req, res, next);

      expect(mockSchema.validate).toHaveBeenCalledWith(req.body);
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 and log warning if validation fails', () => {
      // Mock a Joi-like schema that fails
      const mockSchema = {
        validate: jest.fn().mockReturnValue({
          error: {
            details: [{ message: '"email" is required' }],
          },
        }),
      };

      const middleware = validate(mockSchema);
      middleware(req, res, next);

      expect(logger.warn).toHaveBeenCalled(); // Check logging
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: '"email" is required' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should validate a custom property (e.g., req.query)', () => {
      req.query = { page: 1 };
      const mockSchema = {
        validate: jest.fn().mockReturnValue({ error: null }),
      };

      // Pass 'query' as the second argument
      const middleware = validate(mockSchema, 'query');
      middleware(req, res, next);

      expect(mockSchema.validate).toHaveBeenCalledWith(req.query);
      expect(next).toHaveBeenCalled();
    });
  });

  // --- Error Handler Tests ---
  describe('error-handler.middleware', () => {
    it('should handle error with specific status code', () => {
      const error = new Error('Not Found');
      error.statusCode = 404;

      errorHandler(error, req, res, next);

      expect(logger.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          message: 'Not Found',
          requestId: '123',
        },
      });
    });

    it('should default to 500 for generic errors', () => {
      const error = new Error('Database Crash');
      // No statusCode property

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({ message: 'Database Crash' })
      }));
    });
  });
});