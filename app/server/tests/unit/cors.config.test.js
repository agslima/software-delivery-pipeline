const baseEnv = { ...process.env };

const loadCorsConfig = (corsOrigin) => {
  jest.resetModules();
  process.env.CORS_ORIGIN = corsOrigin;

  let corsConfig;
  jest.isolateModules(() => {
    corsConfig = require('../../src/config/cors');
  });

  return corsConfig;
};

describe('Unit: cors config', () => {
  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
  });

  it('allows localhost origins even when not explicitly allowlisted', () => {
    const corsConfig = loadCorsConfig('https://app.example.test');
    const callback = jest.fn();

    corsConfig.origin('http://localhost:5173', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('allows exact allowlisted preview origins including scheme and port', () => {
    const corsConfig = loadCorsConfig(
      'https://preview-123.app.github.dev,https://preview-456.githubpreview.dev:8443'
    );
    const callback = jest.fn();

    corsConfig.origin('https://preview-456.githubpreview.dev:8443', callback);

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('rejects preview origins that only match by hostname suffix', () => {
    const corsConfig = loadCorsConfig('https://preview-123.app.github.dev');
    const callback = jest.fn();

    corsConfig.origin('https://evil-preview.app.github.dev', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(callback.mock.calls[0][0].message).toBe('Not allowed by CORS');
  });

  it('rejects allowlist misses when only the port differs', () => {
    const corsConfig = loadCorsConfig('https://preview-123.githubpreview.dev:8443');
    const callback = jest.fn();

    corsConfig.origin('https://preview-123.githubpreview.dev', callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(callback.mock.calls[0][0].message).toBe('Not allowed by CORS');
  });
});
