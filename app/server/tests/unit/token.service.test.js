// app/server/tests/unit/token.service.test.js
const TokenService = require('../../src/services/token.service');

describe('Unit: TokenService (Interface)', () => {
  let service;

  beforeEach(() => {
    service = new TokenService();
  });

  it('should throw error when calling sign() directly', () => {
    expect(() => {
      service.sign({});
    }).toThrow('Not implemented');
  });

  it('should throw error when calling verify() directly', () => {
    expect(() => {
      service.verify('token');
    }).toThrow('Not implemented');
  });
});