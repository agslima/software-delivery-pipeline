const baseEnv = { ...process.env };

const loadCreateApp = ({ trustProxy } = {}) => {
  jest.resetModules();

  if (trustProxy === undefined) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = trustProxy;
  }

  return require('../../src/app/createApp');
};

describe('Unit: createApp', () => {
  afterEach(() => {
    Object.keys(process.env).forEach((key) => {
      if (!(key in baseEnv)) delete process.env[key];
    });
    Object.assign(process.env, baseEnv);
  });

  it('uses the default trust proxy setting when TRUST_PROXY is unset', () => {
    const createApp = loadCreateApp();
    const app = createApp();

    expect(app.get('trust proxy')).toBe('loopback, linklocal, uniquelocal');
  });

  it('uses TRUST_PROXY when configured', () => {
    const createApp = loadCreateApp({ trustProxy: 'loopback' });
    const app = createApp();

    expect(app.get('trust proxy')).toBe('loopback');
  });
});
