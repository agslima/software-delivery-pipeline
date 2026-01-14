const { v4: uuid } = require('uuid');

module.exports = (req, res, next) => {
  const requestId = uuid();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
