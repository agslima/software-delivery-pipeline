const { AuthService } = require('../../../core/auth/auth.service');
const tokenService = require('../../../infra/auth/jwtToken.service');
const env = require('../../../config/env');

const authService = new AuthService({
  tokenService,
  adminUser: env.ADMIN_USER,
  adminPass: env.ADMIN_PASS,
});

exports.login = (req, res, next) => {
  try {
    const token = authService.login(req.body);
    return res.status(200).json({ token });
  } catch (err) {
    return next(err);
  }
};
