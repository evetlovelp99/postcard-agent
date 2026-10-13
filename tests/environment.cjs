const path = require('node:path');
const net = require('node:net');

// Awaited by Jest before hooks, test modules, and src/app.js are loaded.
module.exports = async () => {
  const testEnvironment = {
    NODE_ENV: 'test',
    PORT: '0',
    MONGODB_URI: 'test-database-not-ready',
    MONGODB_DB_NAME: 'postcard_test',
    MONGODB_TLS: 'false',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
    VERTEX_PROJECT_ID: 'test-vertex-project',
    VERTEX_LOCATION: 'test-location',
    VERTEX_IMAGE_MODEL: 'gemini-2.5-flash-image',
    RESEND_API_KEY: 'test-resend-key',
    GOOGLE_APPLICATION_CREDENTIALS: '',
    GOOGLE_CLOUD_PROJECT: 'test-vertex-project',
    GCLOUD_PROJECT: 'test-vertex-project',
    VITE_API_BASE_URL: 'test-placeholder',
    DOTENV_CONFIG_QUIET: 'true',
    MONGOMS_VERSION: '7.0.41',
    MONGOMS_DOWNLOAD_DIR: process.env.MONGOMS_DOWNLOAD_DIR || path.resolve(__dirname, '../node_modules/.cache/mongodb-binaries'),
  };
  Object.assign(process.env, testEnvironment);

  const { MongoMemoryServer } = require('mongodb-memory-server');
  const memoryServer = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1' } });
  process.env.MONGODB_URI = memoryServer.getUri();

  function assertLocalDatabase() {
    let uri;
    try {
      uri = new URL(process.env.MONGODB_URI);
    } catch {
      throw new Error('Tests require a valid local MongoDB URI; value withheld.');
    }
    if (uri.protocol !== 'mongodb:' || !['localhost', '127.0.0.1'].includes(uri.hostname)) {
      throw new Error('Tests refuse non-local MongoDB connections; URI withheld.');
    }
    for (const [name, value] of Object.entries(testEnvironment)) {
      if (name !== 'MONGODB_URI' && process.env[name] !== value) {
        throw new Error(`Test environment variable ${name} was overwritten; value withheld.`);
      }
    }
  }

  try {
    assertLocalDatabase();
  } catch (error) {
    await memoryServer.stop();
    throw error;
  }

  // The binary download above is the only allowed external network access.
  // Guard the socket primitive as well as fetch, including SDK fall-through.
  const originalConnect = net.Socket.prototype.connect;
  const originalFetch = globalThis.fetch;
  const blockedRequests = [];
  net.Socket.prototype.connect = function (...args) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const options = normalized[0];
    const host = typeof options === 'object'
      ? options.host || 'localhost'
      : typeof normalized[1] === 'string' ? normalized[1] : 'localhost';
    if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
      blockedRequests.push('socket');
      throw new Error('External network access is forbidden in backend tests; destination withheld.');
    }
    return originalConnect.apply(this, args);
  };
  globalThis.fetch = async () => {
    blockedRequests.push('fetch');
    throw new Error('Network fetch is forbidden in backend tests; use SDK mocks.');
  };

  globalThis.testDatabase = {
    memoryServer,
    assertLocalDatabase,
    blockedRequests,
    restoreNetwork() {
      net.Socket.prototype.connect = originalConnect;
      globalThis.fetch = originalFetch;
    },
  };
};
