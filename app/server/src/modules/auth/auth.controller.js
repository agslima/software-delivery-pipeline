// /src/modules/auth/auth.controller.js
const AuthService = require('./auth.service');
const tokenService = require('../../services/jwt-token.service');

const authService = new AuthService(tokenService);

exports.login = (req, res) => {
  try {
    const token = authService.login(req.body);
    return res.status(200).json({ token });
  } catch {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
};


