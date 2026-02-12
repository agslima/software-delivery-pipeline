const baseEnv = { ...process.env };

const setup = ({ enforceTls } = {}) => {
  jest.resetModules();

  process.env.ENFORCE_TLS = enforceTls ? 'true' : 'false';

  let middleware;
  jest.isolateModules(() => {
    middleware = require('../../src/api/http/middleware/requireTls');
  });

  return middleware;
};

describe('Unit: requireTls middleware', () => {
  afterAll(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
  });

  it('allows request when ENFORCE_TLS is false', () => {
    const requireTls = setup({ enforceTls: false });
    const req = { secure: false, headers: {} };
    const next = jest.fn();

    requireTls(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('allows request when req.secure is true', () => {
    const requireTls = setup({ enforceTls: true });
    const req = { secure: true, headers: {} };
    const next = jest.fn();

    requireTls(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('allows request when x-forwarded-proto is https', () => {
    const requireTls = setup({ enforceTls: true });
    const req = { secure: false, headers: { 'x-forwarded-proto': 'https' } };
    const next = jest.fn();

    requireTls(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('rejects request when TLS is required and request is not secure', () => {
    const requireTls = setup({ enforceTls: true });
    const req = { secure: false, headers: { 'x-forwarded-proto': 'http' } };
    const next = jest.fn();

    requireTls(req, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.name).toBe('AppError');
    expect(err.code).toBe('TLS_REQUIRED');
  });
});
