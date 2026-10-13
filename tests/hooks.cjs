const sdkMocks = {
  text: jest.fn(),
  caption: jest.fn(),
  image: jest.fn(),
  email: jest.fn(),
};

jest.doMock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn(function () {
    this.getGenerativeModel = (options) => ({
      generateContent: options.systemInstruction ? sdkMocks.caption : sdkMocks.text,
    });
  }),
}));

jest.doMock('@google/genai', () => ({
  GoogleGenAI: jest.fn(function () {
    this.models = { generateContent: sdkMocks.image };
  }),
}));

// These installed Vertex SDKs are not used by the current image service.
// Fail closed if a code path starts using them without a specific mock.
jest.doMock('@google-cloud/vertexai', () => ({
  VertexAI: jest.fn(() => { throw new Error('Unexpected VertexAI SDK call in tests.'); }),
}));
jest.doMock('@google-cloud/aiplatform', () => ({
  v1: {
    PredictionServiceClient: jest.fn(() => {
      throw new Error('Unexpected Vertex PredictionServiceClient call in tests.');
    }),
  },
}));

jest.doMock('resend', () => ({
  Resend: jest.fn(function () {
    this.emails = { send: sdkMocks.email };
  }),
}));

globalThis.sdkMocks = sdkMocks;

beforeEach(() => {
  globalThis.testDatabase.assertLocalDatabase();
});

afterEach(() => {
  expect(globalThis.testDatabase.blockedRequests).toEqual([]);
  expect(sdkMocks.email).not.toHaveBeenCalled();
});

afterAll(async () => {
  try {
    const { closeMongoConnection } = require('../src/config/database');
    await closeMongoConnection();
  } finally {
    try {
      await globalThis.testDatabase.memoryServer.stop();
    } finally {
      globalThis.testDatabase.restoreNetwork();
    }
  }
});
