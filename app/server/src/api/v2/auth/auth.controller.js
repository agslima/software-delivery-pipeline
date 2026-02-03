const { PasswordAuthService } = require('../../../core/auth/passwordAuth.service');
const { UsersRepository } = require('../../../infra/users/users.repository');
const tokenService = require('../../../infra/auth/jwtToken.service');

const service = new PasswordAuthService({
  usersRepository: new UsersRepository(),
  tokenService,
});

exports.login = async (req, res, next) => {
  try {
    const payload = await service.login(req.body);
    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
};
