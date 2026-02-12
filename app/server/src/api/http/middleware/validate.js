const { AppError } = require('../errors/AppError');

module.exports = function validate(schema, property = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return next(
        new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.details.map(d => ({ message: d.message, path: d.path })),
        })
      );
    }

    if (property === 'query' && req.query) {
      Object.keys(req.query).forEach((key) => {
        delete req.query[key];
      });
      Object.assign(req.query, value);
    } else {
      req[property] = value;
    }
    next();
  };
};
