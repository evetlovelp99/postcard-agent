const request = require('supertest');
const { ObjectId } = require('mongodb');
const app = require('../src/app');
const { getDatabase } = require('../src/config/database');

const mocks = globalThis.sdkMocks;
const anchor = { location: 'San Jose City Hall', address: '200 E Santa Clara St', type: 'landmark' };
const stamp = {
  city: 'San Jose', country: 'United States', landmark: 'City Hall',
  nature: 'Coyote Creek', food: 'Burritos', colorPalette: 'amber, red, brown',
  stampStyle: 'vintage city passport stamp',
};
const atmosphere = {
  city: 'San Jose', currentMood: 'Quiet afternoon',
  visualPalette: ['amber', 'red', 'brown'],
  sensoryDetails: ['light', 'warmth', 'footsteps', 'breeze', 'shade'],
  localFood: [1, 2, 3].map((i) => ({ name: `Food ${i}`, description: `Flavor ${i}` })),
  localPlaces: [anchor.location, 'Coyote Creek', 'Market'].map((name) => ({ name, description: 'Afternoon light' })),
  visualElements: ['glass', 'trees', 'brick'],
  travelMoments: ['one', 'two', 'three', 'four', 'five'],
  shortFragments: ['one', 'two', 'three', 'four', 'five'],
  postcardCaption: 'Afternoon at City Hall.',
  emotionalStyles: ['quiet', 'warm', 'present'],
  imagePrompt: 'City Hall in afternoon light',
};
const imageBase64 = Buffer.from('mock-image-bytes').toString('base64');
const body = { city: 'San Jose', countryName: 'United States', preferences: ['Landmarks'] };
let database;
let atmosphereText;
let loggedErrors;

function textResponse(value) {
  return { response: { text: () => typeof value === 'string' ? value : JSON.stringify(value) } };
}

function createPostcard(userId = 'test-user') {
  return request(app).post('/api/postcards').set('x-user-id', userId).send(body);
}

function stampCallCount() {
  return mocks.text.mock.calls.filter(([prompt]) => prompt.startsWith('You are designing a vintage passport city stamp')).length;
}

beforeEach(async () => {
  database = await getDatabase();
  await database.collection('postcards').deleteMany({});
  await database.collection('cities').deleteMany({});
  for (const mock of Object.values(mocks)) mock.mockReset();
  atmosphereText = JSON.stringify(atmosphere);
  mocks.text.mockImplementation(async (prompt) => {
    if (prompt.startsWith('You are designing a vintage passport city stamp')) return textResponse(stamp);
    if (prompt.startsWith('You choose ONE specific')) return textResponse(anchor);
    if (prompt.startsWith('You are a travel memory and city atmosphere assistant')) return textResponse(atmosphereText);
    throw new Error('Unexpected Gemini prompt in test fixture.');
  });
  mocks.caption.mockResolvedValue(textResponse('"The light was good today."'));
  mocks.image.mockResolvedValue({
    candidates: [{ content: { parts: [{ inlineData: { data: imageBase64, mimeType: 'image/png' } }] } }],
  });
  mocks.email.mockRejectedValue(new Error('Email must not be sent in postcard tests.'));
  loggedErrors = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  loggedErrors.mockRestore();
});

test('saves the postcard when the image model fails and skips vision caption', async () => {
  mocks.image.mockRejectedValue(new Error('mock image unavailable'));
  const response = await createPostcard();
  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  expect(response.body.data).toMatchObject({ image: null, caption: null, atmosphere: { currentMood: atmosphere.currentMood } });
  const saved = await database.collection('postcards').findOne({ _id: new ObjectId(response.body.data.id) });
  expect(saved).toMatchObject({ userId: 'test-user', image: null, caption: null });
  expect(mocks.image).toHaveBeenCalledTimes(1);
  expect(mocks.caption).not.toHaveBeenCalled();
  expect(loggedErrors).toHaveBeenCalledWith('Image generation failed:', 'Gemini image API request failed: mock image unavailable');
});

test('saves the image and postcard when the vision caption model fails', async () => {
  mocks.caption.mockRejectedValue(new Error('mock caption unavailable'));
  const response = await createPostcard();
  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  expect(response.body.data).toMatchObject({ caption: null, image: { base64: imageBase64, mimeType: 'image/png' } });
  const saved = await database.collection('postcards').findOne({ _id: new ObjectId(response.body.data.id) });
  expect(saved).toMatchObject({ caption: null, image: { base64: imageBase64 } });
  expect(mocks.caption).toHaveBeenCalledTimes(1);
  expect(mocks.caption.mock.calls[0][0][0].inlineData).toEqual({ data: imageBase64, mimeType: 'image/png' });
  expect(loggedErrors).toHaveBeenCalledWith('Caption generation failed:', 'Gemini API request failed: mock caption unavailable');
});

test('reuses the stamp for the same user, city, and country; the real compound index rejects duplicates', async () => {
  const first = await createPostcard();
  const second = await createPostcard();
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(first.body.data.stampIsNew).toBe(true);
  expect(second.body.data.stampIsNew).toBe(false);
  expect(second.body.data.cityId).toBe(first.body.data.cityId);
  expect(second.body.data.aiStamp).toEqual(first.body.data.aiStamp);
  expect(stampCallCount()).toBe(1);
  expect(await database.collection('postcards').countDocuments({ userId: 'test-user' })).toBe(2);

  const cities = database.collection('cities');
  const indexes = await cities.listIndexes().toArray();
  expect(indexes).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: { userId: 1, cityName: 1, countryName: 1 }, unique: true }),
  ]));
  const duplicate = { userId: 'test-user', cityName: 'San Jose', countryName: 'United States' };
  await expect(cities.insertOne({ ...duplicate })).rejects.toMatchObject({ code: 11000 });
  await cities.insertOne({ ...duplicate, userId: 'other-user' });
  await cities.insertOne({ ...duplicate, countryName: 'Costa Rica' });
  await cities.insertOne({ ...duplicate, cityName: 'Santa Clara' });
  expect(await cities.countDocuments({})).toBe(4);
  expect(stampCallCount()).toBe(1);
});

test('injects only the current user\'s five most recent postcards into the Gemini memory context', async () => {
  await database.collection('postcards').insertMany([
    ...Array.from({ length: 6 }, (_, i) => ({
      userId: 'test-user', city: `Memory City ${i}`,
      atmosphere: { currentMood: `memory-${i}`, postcardCaption: `caption-${i}`, travelMoments: [`moment-${i}`] },
      createdAt: new Date(Date.UTC(2025, 0, i + 1)),
    })),
    { userId: 'other-user', city: 'Other User City', atmosphere: { currentMood: 'other-user-memory' }, createdAt: new Date('2030-01-01') },
  ]);
  const response = await createPostcard();
  expect(response.status).toBe(201);
  expect(response.body.data.memoryContextCount).toBe(5);
  const prompt = mocks.text.mock.calls.find(([text]) => text.startsWith('You are a travel memory and city atmosphere assistant'))[0];
  const memory = prompt.split('TRAVELER MEMORY (past postcards):')[1].split('TRAVELER PERSONALITY')[0];
  let previousPosition = -1;
  for (const i of [5, 4, 3, 2, 1]) {
    const position = memory.indexOf(`memory-${i}`);
    expect(position).toBeGreaterThan(previousPosition);
    previousPosition = position;
  }
  expect(prompt).not.toContain('memory-0');
  expect(prompt).not.toContain('other-user-memory');
  expect(memory.match(/mood: memory-/g)).toHaveLength(5);
});

test('documents current behavior: malformed atmosphere JSON returns 500 and no postcard is saved', async () => {
  atmosphereText = '{invalid-json';
  const response = await createPostcard();
  expect(response.status).toBe(500);
  expect(response.body.success).toBe(false);
  expect(response.body.error).toMatch(/^Failed to parse Gemini JSON response:/);
  expect(await database.collection('postcards').countDocuments({})).toBe(0);
  // Existing behavior: stamp creation precedes atmosphere parsing.
  expect(await database.collection('cities').countDocuments({})).toBe(1);
  expect(mocks.image).not.toHaveBeenCalled();
  expect(mocks.caption).not.toHaveBeenCalled();
  expect(loggedErrors).toHaveBeenCalledWith(expect.any(Error));
});

test('documents current behavior: missing atmosphere fields accepted and saved (existing schema validation gap)', async () => {
  atmosphereText = '{}';
  const response = await createPostcard();
  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  const incomplete = { preferences: ['Landmarks'], anchorLocation: anchor };
  expect(response.body.data.atmosphere).toEqual(incomplete);
  const saved = await database.collection('postcards').findOne({ _id: new ObjectId(response.body.data.id) });
  expect(saved.atmosphere).toEqual(incomplete);
  expect(saved.atmosphere).not.toHaveProperty('currentMood');
  expect(saved.atmosphere).not.toHaveProperty('localPlaces');
  expect(saved.caption).toBe('The light was good today.');
  expect(saved.image.base64).toBe(imageBase64);
});
