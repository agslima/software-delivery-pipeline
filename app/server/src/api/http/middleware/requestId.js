const { randomUUID } = require('node:crypto');

const generateRequestId = () => {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  // Fallback for older runtimes that lack randomUUID.
  const { v4: uuid } = require('uuid');
  return uuid();
};

module.exports = function requestId(req, res, next) {
  const inbound = req.header('x-request-id');

  // basic sanity (avoid log injection / huge headers)
  const safeInbound =
    inbound && inbound.length <= 128 && /^[a-zA-Z0-9\-_.:]+$/.test(inbound) ? inbound : null;

  req.id = safeInbound || generateRequestId();
  res.setHeader('X-Request-Id', req.id);

  next();
};
