class AppError extends Error {
  constructor({ status = 500, code = 'INTERNAL', message = 'Internal Server Error', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

module.exports = { AppError };

