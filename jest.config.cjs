module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/environment.cjs'],
  setupFilesAfterEnv: ['<rootDir>/tests/hooks.cjs'],
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  transform: {},
  testTimeout: 30000,
  verbose: true,
  reporters: ['default'],
};
