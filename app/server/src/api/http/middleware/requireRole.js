const { AppError } = require('../errors/AppError');

module.exports = function requireRole(...roles) {
  const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;

  return (req, _res, next) => {
    const role = req.user && req.user.role;

    if (!role) {
      return next(new AppError({ status: 401, code: 'UNAUTHORIZED', message: 'Unauthorized' }));
    }

    if (!allowedRoles.includes(role)) {
      return next(new AppError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' }));
    }

    return next();
  };
};
