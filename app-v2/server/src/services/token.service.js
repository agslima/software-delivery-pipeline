/**
 * TokenService interface
 */
class TokenService {
  sign(payload) {
    throw new Error('Not implemented');
  }

  verify(token) {
    throw new Error('Not implemented');
  }
}

module.exports = TokenService;
