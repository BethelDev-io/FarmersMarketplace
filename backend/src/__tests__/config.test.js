/**
 * Tests for config.js production REFRESH_TOKEN_SECRET validation (BE-10).
 */

describe('config — production REFRESH_TOKEN_SECRET validation', () => {
  let originalEnv;
  let exitSpy;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.resetModules();
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('throws when REFRESH_TOKEN_SECRET is unset in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    delete process.env.REFRESH_TOKEN_SECRET;

    expect(() => require('../config')).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('throws when REFRESH_TOKEN_SECRET equals JWT_SECRET in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.REFRESH_TOKEN_SECRET = process.env.JWT_SECRET;

    expect(() => require('../config')).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('allows a distinct REFRESH_TOKEN_SECRET in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.REFRESH_TOKEN_SECRET = 'b'.repeat(32);

    const config = require('../config');
    expect(config.refreshTokenSecret).toBe(process.env.REFRESH_TOKEN_SECRET);
  });

  it('does not require REFRESH_TOKEN_SECRET outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'a'.repeat(32);
    delete process.env.REFRESH_TOKEN_SECRET;

    const config = require('../config');
    expect(config.refreshTokenSecret).toBe(process.env.JWT_SECRET);
  });
});
