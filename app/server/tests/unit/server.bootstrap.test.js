describe('Unit: server bootstrap', () => {
  const originalProcessOn = process.on;
  const originalSetTimeout = global.setTimeout;

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    process.on = originalProcessOn;
    global.setTimeout = originalSetTimeout;
  });

  const loadServer = ({ envOverrides = {} } = {}) => {
    const listen = jest.fn((_port, _host, callback) => {
      if (callback) callback();
      return undefined;
    });
    const close = jest.fn();
    const unref = jest.fn();

    const httpCreateServer = jest.fn(() => ({ listen, close }));
    const httpsCreateServer = jest.fn(() => ({ listen, close }));
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
    };
    const env = {
      ENFORCE_TLS: false,
      TLS_CERT_PATH: '',
      TLS_KEY_PATH: '',
      PORT: 8080,
      NODE_ENV: 'test',
      ...envOverrides,
    };
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    process.on = jest.fn();
    global.setTimeout = jest.fn(() => ({ unref }));

    jest.doMock('http', () => ({ createServer: httpCreateServer }));
    jest.doMock('https', () => ({ createServer: httpsCreateServer }));
    jest.doMock('fs', () => ({ readFileSync: jest.fn(() => 'pem') }));
    jest.doMock('../../src/app/createApp', () => jest.fn(() => 'app-instance'));
    jest.doMock('../../src/config/env', () => env);
    jest.doMock('../../src/observability/logger', () => logger);
    jest.doMock('../../src/infra/db/knex', () => ({ destroy: jest.fn() }));

    let thrown;
    try {
      jest.isolateModules(() => {
        require('../../src/app/server');
      });
    } catch (err) {
      thrown = err;
    }

    return { httpCreateServer, httpsCreateServer, logger, exit, thrown };
  };

  it('starts HTTP when no TLS listener certs are configured', () => {
    const { httpCreateServer, httpsCreateServer, logger } = loadServer({
      envOverrides: {
        ENFORCE_TLS: true,
        TLS_CERT_PATH: '',
        TLS_KEY_PATH: '',
      },
    });

    expect(httpCreateServer).toHaveBeenCalledWith('app-instance');
    expect(httpsCreateServer).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ tls: false }, 'TLS listener not configured; starting HTTP server');
  });

  it('starts HTTPS when both TLS cert paths are configured', () => {
    const { httpCreateServer, httpsCreateServer, logger } = loadServer({
      envOverrides: {
        ENFORCE_TLS: false,
        TLS_CERT_PATH: '/tmp/server.crt',
        TLS_KEY_PATH: '/tmp/server.key',
      },
    });

    expect(httpCreateServer).not.toHaveBeenCalled();
    expect(httpsCreateServer).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ tls: true }, 'TLS enabled for API server');
  });

  it('fails fast when only one TLS path is configured', () => {
    const { httpCreateServer, httpsCreateServer, logger, thrown } = loadServer({
      envOverrides: {
        TLS_CERT_PATH: '/tmp/server.crt',
        TLS_KEY_PATH: '',
      },
    });

    expect(httpCreateServer).not.toHaveBeenCalled();
    expect(httpsCreateServer).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith('TLS_CERT_PATH and TLS_KEY_PATH must both be set to enable HTTPS.');
    expect(thrown).toBeDefined();
    expect(thrown.message).toBe('process.exit');
  });
});
