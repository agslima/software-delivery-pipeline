const logger = require('../utils/logger');

const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property]);

    if (error) {
      const message = error.details.map(i => i.message).join(',');

      logger.warn({
        path: req.originalUrl,
        validationError: message,
      }, 'Input validation failed');

      return res.status(400).json({ error: message });
    }

    next();
  };
};

module.exports = validate;
