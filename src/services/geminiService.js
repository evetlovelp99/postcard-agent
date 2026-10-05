const { GoogleGenerativeAI } = require('@google/generative-ai');
 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
 
let generativeModel = null;
 
function summarizeTravelerMemory(recentMemories) {
  if (!recentMemories.length) {
    return 'No prior postcard history is available yet. This is their first postcard.';
  }
 
  const patterns = recentMemories.map((memory, index) => {
    const mood = memory.atmosphere?.currentMood || 'unknown mood';
    const caption = memory.atmosphere?.postcardCaption || 'no saved caption';
    const city = memory.city || 'unknown city';
    const moments = memory.atmosphere?.travelMoments?.join(', ') || '';
    return `${index + 1}. ${city} — mood: ${mood}; caption: "${caption}"${moments ? `; moments: ${moments}` : ''}`;
  });
 
  return patterns.join('\n');
}
 
function inferTravelPersonality(recentMemories) {
  if (!recentMemories.length) return '';
 
  const captions = recentMemories.map(m => m.atmosphere?.postcardCaption || '').filter(Boolean);
  const moods = recentMemories.map(m => m.atmosphere?.currentMood || '').filter(Boolean);
  const moments = recentMemories.flatMap(m => m.atmosphere?.travelMoments || []);
 
  return `
Based on their history, this traveler tends to gravitate toward:
- Moods they've responded to: ${moods.slice(0, 5).join(', ')}
- Types of moments they've chosen: ${moments.slice(0, 6).join(', ')}
- Captions they've written: ${captions.slice(0, 3).map(c => `"${c}"`).join(', ')}
 
Use this to personalize which moments, foods, places, and fragments you surface.
Do not repeat the same cities or moments they've already experienced.
  `.trim();
}
 
function cleanJsonPayload(rawText) {
  return rawText.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
}
 
function getGenerativeModel() {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Missing Gemini API key. Set GEMINI_API_KEY in your .env file.'
    );
  }
 
  if (!generativeModel) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    generativeModel = genAI.getGenerativeModel({
      model: DEFAULT_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.9,
      },
    });
  }
 
  return generativeModel;
}
 
function buildImagePromptFieldDescription(city, preferences = []) {
  const selected = preferences.length ? preferences.join(', ') : 'none specified';

  return `"imagePrompt": "string — The user selected: ${selected}.
- If Landmarks: show a real, named, iconic landmark of ${city} that people would recognize. Name it explicitly in the prompt.
- If Food: show a close-up of a specific local dish or street food scene from ${city}. Name the food.
- If Quiet Moments: show an intimate, empty side street or café in ${city}.
- If Nightlife: show a lit-up bar street or night market in ${city}.
- If Nature: show a park, trail, or natural scene specific to ${city}.
Pick the instruction that matches the user's selection(s). If multiple are selected, blend them into one cohesive scene.
Film photography mood, Kodak Portra, warm tones, no text."`;
}

function buildAnchorContext(anchorLocation, city) {
  if (!anchorLocation?.location) {
    return '';
  }

  return `
ANCHOR LOCATION (single place for this entire postcard — image, caption, and all copy must match this place):
- Name: ${anchorLocation.location}
- Address: ${anchorLocation.address || 'unknown'}
- Type: ${anchorLocation.type || 'place'}
- City: ${city}

The first entry in localPlaces MUST be this anchor location by name.
imagePrompt MUST describe a photograph of this exact place, not a different street or building.
  `.trim();
}

function buildPrompt({ city, travelerId, recentMemories, preferences = [], anchorLocation = null }) {
  const memoryContext = summarizeTravelerMemory(recentMemories);
  const personalityContext = inferTravelPersonality(recentMemories);
  const imagePromptField = buildImagePromptFieldDescription(city, preferences);
  const preferenceContext = preferences.length
    ? `The traveler selected these visual themes for this postcard: ${preferences.join(', ')}. Prioritize these in travel moments, local places, and the imagePrompt.`
    : '';
  const anchorContext = buildAnchorContext(anchorLocation, city);

  return `
You are a travel memory and city atmosphere assistant for PostCard Agent.
 
Your purpose is not to act as a travel guide or itinerary planner.
Your role is to help users emotionally capture a city so they can create a personal travel postcard that feels human, memorable, and emotionally connected to the place.
 
The experience should feel closer to:
- a personal travel journal
- quiet city observations
- fragments of memory
- moments noticed during a trip
 
rather than tourism recommendations.
 
---
CITY: "${city}"
TRAVELER ID: "${travelerId}"
 
TRAVELER MEMORY (past postcards):
${memoryContext}
 
TRAVELER PERSONALITY (inferred from history):
${personalityContext || 'First visit — no personality inferred yet. Surface a mix of iconic and quiet local moments.'}

VISUAL PREFERENCES FOR THIS POSTCARD:
${preferenceContext || 'No specific visual preference — choose a scene that best captures the city mood.'}

${anchorContext || 'Pick one specific place in the city and keep all content anchored to it.'}
---
 
Generate a postcard atmosphere for ${city} right now. Consider the current season and likely time of day.
 
Follow these guidelines for each section:
 
[City Atmosphere]
Describe the atmosphere through sensory details, movement, small observations, and emotionally grounded moments.
Focus on: lighting, weather, sounds, movement, temperature, street rhythm, human details, textures, brief interactions, passing moments.
Avoid overly polished or cinematic writing. Instead of explaining how the place feels, focus on specific details that naturally create emotion.
Sometimes the smallest details create the strongest memories.
 
[Local Food]
3 foods, drinks, snacks, or dining atmospheres that genuinely represent the emotional identity of ${city}.
Focus on: warmth, smell, setting, texture, routine, emotional feeling, local lifestyle.
Do not describe food like a restaurant review.
 
[Local Places]
3 places that capture the personality of ${city} — can be famous landmarks, subway stations, side streets, markets, parks, alleys.
Describe through lived experience and visual feeling, not as tourist attractions.
 
[Visual Elements]
3 visual elements that strongly represent the atmosphere of ${city}.
Focus on elements that instantly make someone feel: "I know this city."
 
[Travel Moments]
5 personally resonant travel moments for this specific traveler, based on their personality and history.
These should NOT be generic top-10 sightseeing options.
Each moment should be a specific scene: a place + a time + a sensory detail.
Make them feel like something only this traveler would notice.
 
[Short Fragments]
5 short emotional sentence fragments for postcard inspiration.
These should feel naturally human, slightly incomplete, and emotionally real.
Avoid long paragraphs. Not every sentence needs to sound profound.
Tone: personal, quiet, observant, slightly imperfect.
 
[Postcard Caption]
One suggested caption for the postcard.
It should feel like a real personal memory, not AI-generated travel content.
Short, emotionally specific, slightly imperfect.
 
---
 
Return strict JSON with this exact shape. Do not wrap in markdown:
{
  "city": "string",
  "currentMood": "string — one evocative phrase describing the city right now",
  "visualPalette": ["string", "string", "string"],
  "sensoryDetails": ["string", "string", "string", "string", "string"],
  "localFood": [
    { "name": "string", "description": "string" },
    { "name": "string", "description": "string" },
    { "name": "string", "description": "string" }
  ],
  "localPlaces": [
    { "name": "string", "description": "string" },
    { "name": "string", "description": "string" },
    { "name": "string", "description": "string" }
  ],
  "visualElements": ["string", "string", "string"],
  "travelMoments": ["string", "string", "string", "string", "string"],
  "shortFragments": ["string", "string", "string", "string", "string"],
  "postcardCaption": "string",
  "emotionalStyles": ["string", "string", "string"],
  ${imagePromptField}
}
  `.trim();
}
 
async function generateCityAtmosphere({
  city,
  travelerId,
  recentMemories,
  preferences = [],
  anchorLocation = null,
}) {
  const prompt = buildPrompt({
    city,
    travelerId,
    recentMemories,
    preferences,
    anchorLocation,
  });
  const model = getGenerativeModel();
 
  let result;
 
  try {
    result = await model.generateContent(prompt);
  } catch (error) {
    throw new Error(`Gemini API request failed: ${error.message}`);
  }
 
  const rawText = result.response.text().trim();
 
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }
 
  let atmosphere;
 
  try {
    atmosphere = JSON.parse(cleanJsonPayload(rawText));
  } catch (error) {
    throw new Error(`Failed to parse Gemini JSON response: ${error.message}`);
  }
 
  return {
    atmosphere,
    model: DEFAULT_MODEL,
    prompt,
    rawText,
  };
}

const CAPTION_SYSTEM_PROMPT = `You are writing the handwritten caption on a personal travel postcard.

Look at the image carefully. Write a caption that:
- References something specific you can actually see in the photo 
  (the food, the light, the object, the moment)
- Is 1–2 sentences max
- Can be in any language the user prefers

Tone: a mix of literary and present-moment warmth.
Not journalistic. Not a punchline. Not Instagram-motivational.
Write like someone sitting alone at a good table, quietly noticing 
things — the light, the time, the feeling of being exactly here.
Let it trail off slightly. Don't resolve it too neatly.

Good examples:
- "The light came in sideways. The salmon was still warm."
- "This meal belonged to no one else. Just me and this afternoon."
- "Halfway through, I forgot which city I was in."
- "The tree outside moved once. I didn't take a photo of that."
- "The light was good today. The food was worthy of it."
- "Ordered without thinking. Stayed longer than I planned."
- "Something about this plate felt like it was already a memory."
- "The afternoon was almost over. I didn't rush."

Bad examples (do NOT write like this):
- "San Jose air. Still warm, still dry, carrying eucalyptus on the breeze."
  (ignores the image, describes the city instead)
- "A culinary journey through California comfort food."
  (sounds like a menu description)
- "The vibrant flavors of San Jose."
  (generic, soulless)
- "Didn't mean to order the salmon. Ate every bite."
  (punchline structure, too clever, not literary enough)

Return only the caption text. No quotes, labels, or JSON.`;

let captionModel = null;

function getCaptionModel() {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'Missing Gemini API key. Set GEMINI_API_KEY in your .env file.'
    );
  }

  if (!captionModel) {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    captionModel = genAI.getGenerativeModel({
      model: DEFAULT_MODEL,
      systemInstruction: CAPTION_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 120,
      },
    });
  }

  return captionModel;
}

function preferencesToCategory(preferences = []) {
  const labelMap = {
    Landmarks: 'landmarks',
    Food: 'food',
    'Quiet Moments': 'quiet',
    Nightlife: 'nightlife',
    Nature: 'nature',
  };

  if (preferences.length > 0) {
    return labelMap[preferences[0]] || String(preferences[0]).toLowerCase();
  }

  return 'general';
}

async function imageUrlToInlineData(imageUrl) {
  const normalizedUrl = String(imageUrl || '').trim();

  if (!normalizedUrl) {
    throw new Error('Image URL is required for caption generation.');
  }

  if (normalizedUrl.startsWith('data:')) {
    const match = normalizedUrl.match(/^data:([^;]+);base64,(.+)$/);

    if (!match) {
      throw new Error('Invalid image data URL.');
    }

    return {
      mimeType: match[1],
      data: match[2],
    };
  }

  let response;

  try {
    response = await fetch(normalizedUrl);
  } catch (error) {
    throw new Error(`Failed to fetch image for caption: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch image for caption: HTTP ${response.status}`);
  }

  const mimeType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    mimeType,
    data: buffer.toString('base64'),
  };
}

function normalizeCaptionText(rawText) {
  return String(rawText || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .trim();
}

async function generatePostcardCaption({ city, category, imageUrl }) {
  const normalizedCity = String(city || '').trim();
  const normalizedCategory = String(category || 'general').trim();
  const inlineData = await imageUrlToInlineData(imageUrl);
  const model = getCaptionModel();

  let result;

  try {
    result = await model.generateContent([
      {
        inlineData: {
          mimeType: inlineData.mimeType,
          data: inlineData.data,
        },
      },
      {
        text: `City: ${normalizedCity}. Category: ${normalizedCategory}. Write the postcard caption.`,
      },
    ]);
  } catch (error) {
    throw new Error(`Gemini API request failed: ${error.message}`);
  }

  const caption = normalizeCaptionText(result.response.text());

  if (!caption) {
    throw new Error('Gemini returned an empty caption.');
  }

  return caption;
}

const DETAIL_PANEL_CATEGORIES = new Set(['landmarks', 'food', 'nightlife', 'nature', 'quiet']);

const ANCHOR_TYPE_HINTS = {
  Landmarks: 'landmark',
  Food: 'restaurant',
  'Quiet Moments': 'street',
  Nightlife: 'venue',
  Nature: 'park',
};

async function pickAnchorLocation({
  city,
  preferences = [],
  regenerate = false,
  previousAnchorName = '',
}) {
  const normalizedCity = String(city || '').trim();
  const primaryPreference = preferences[0] || 'Landmarks';
  const typeHint = ANCHOR_TYPE_HINTS[primaryPreference] || 'landmark';
  const normalizedPreviousAnchor = String(previousAnchorName || '').trim();

  let regenerationBlock = '';

  if (regenerate) {
    regenerationBlock = `
This is a regeneration request. Do NOT pick the same place as before.
Pick a different location of the same type in this city.
    `.trim();

    if (normalizedPreviousAnchor) {
      regenerationBlock += `\nPreviously used location: ${normalizedPreviousAnchor}. Do not pick this place again.`;
    }
  }

  const prompt = `
You choose ONE specific, real-world location in ${normalizedCity} for a travel postcard.
The traveler preference is: ${primaryPreference}.
Pick a place that fits this preference. The type should be "${typeHint}".
${regenerationBlock ? `\n${regenerationBlock}\n` : ''}
Rules:
- Use a real place name that exists in ${normalizedCity}.
- Include a real or plausible street address.
- Do not pick a generic description like "downtown" — use a named place.

Return strict JSON only:
{
  "location": "string — full place name, e.g. San Jose City Hall",
  "address": "string — street address",
  "type": "string — one of: landmark, restaurant, street, park, venue"
}
  `.trim();

  const model = getGenerativeModel();
  let result;

  try {
    result = await model.generateContent(prompt);
  } catch (error) {
    throw new Error(`Gemini API request failed: ${error.message}`);
  }

  const rawText = result.response.text().trim();

  if (!rawText) {
    throw new Error('Gemini returned an empty anchor location response.');
  }

  let anchor;

  try {
    anchor = JSON.parse(cleanJsonPayload(rawText));
  } catch (error) {
    throw new Error(`Failed to parse anchor location JSON: ${error.message}`);
  }

  const location = String(anchor.location || '').trim();
  const address = String(anchor.address || '').trim();
  const type = String(anchor.type || typeHint).trim().toLowerCase();

  if (!location) {
    throw new Error('Anchor location response missing location name.');
  }

  return {
    location,
    address: address || normalizedCity,
    type,
  };
}

const DETAIL_PANEL_WRITER_RULES = `
Write like a travel writer who has actually been to the city, not a travel website.
Avoid superlatives. Do not use the words "vibrant", "bustling", or "hidden gem".
Use present tense. Be specific to the city named.
Return strict JSON only. Do not wrap in markdown.
`.trim();

function buildDetailPanelAnchorBlock(anchorLocation, city, category) {
  const place = anchorLocation.location;
  const address = anchorLocation.address || city;

  return `
ANCHOR LOCATION — write ONLY about this exact place. Do not describe a different location.
Place: ${place}
Address: ${address}
Type: ${anchorLocation.type || 'place'}
City: ${city}

Generate ${category} detail panel for: ${place}, ${city}.
The JSON must include "location": "${place}" exactly.
  `.trim();
}

function buildDetailPanelPrompt(city, category, anchorLocation) {
  const cityLabel = city.trim();
  const anchorBlock = buildDetailPanelAnchorBlock(anchorLocation, cityLabel, category);

  switch (category) {
    case 'landmarks':
      return `
You are writing the right-side detail panel for a travel postcard.

${anchorBlock}

${DETAIL_PANEL_WRITER_RULES}

Content rules:
- headline: must be exactly "${anchorLocation.location}".
- body: exactly 2 paragraphs as strings in an array.
  Paragraph 1: why this place was chosen — emotional and visual, not tourism copy.
  Paragraph 2: one architectural or historical detail, concrete and grounded.
- meta: exactly 4 items with short labels and values (e.g. built year, architectural style, cultural connection, best time to visit).
- quote: one line — how locals would describe it, not a tourist description.

Return JSON with this exact shape:
{
  "location": "${anchorLocation.location}",
  "eyebrow": "Why this place",
  "headline": "string",
  "body": ["string", "string"],
  "meta": [
    { "label": "string", "value": "string" },
    { "label": "string", "value": "string" },
    { "label": "string", "value": "string" },
    { "label": "string", "value": "string" }
  ],
  "quote": "string"
}
      `.trim();

    case 'food':
      return `
You are writing the right-side detail panel for a travel postcard.

${anchorBlock}

${DETAIL_PANEL_WRITER_RULES}

Content rules:
- headline: a poetic 3–5 word flavor description (not a restaurant name).
- body: exactly 2 paragraphs.
  Paragraph 1: sensory scene — smell, sound, time of night.
  Paragraph 2: why the colors and light in the image look the way they do.
- atmosphere: exactly 3 items with labels "Warmth", "Crowd", "Local feel" and integer values 0–100.
- quote: one sentence with a local tip — never a Yelp-style recommendation.
- tags: 3–4 mood words as short strings.

Return JSON with this exact shape:
{
  "location": "${anchorLocation.location}",
  "eyebrow": "The taste in this image",
  "headline": "string",
  "body": ["string", "string"],
  "atmosphere": [
    { "label": "Warmth", "value": 0 },
    { "label": "Crowd", "value": 0 },
    { "label": "Local feel", "value": 0 }
  ],
  "quote": "string",
  "tags": ["string", "string", "string"]
}
      `.trim();

    case 'nightlife':
      return `
You are writing the right-side detail panel for a travel postcard.

${anchorBlock}

${DETAIL_PANEL_WRITER_RULES}

Content rules:
- headline: a short personality verdict on ${cityLabel} at night (under 12 words).
- body: exactly 2 paragraphs.
  Paragraph 1: sensory night scene.
  Paragraph 2: what kind of city this is at night — energy, type of people, vibe.
- timeFragments: exactly 2 items — "Before midnight" and "After 1am". Each text is 1–2 sentences, a scene not a list of bars.
- quote: one line that captures the city's nighttime personality.

Return JSON with this exact shape:
{
  "location": "${anchorLocation.location}",
  "eyebrow": "City character after dark",
  "headline": "string",
  "body": ["string", "string"],
  "timeFragments": [
    { "label": "Before midnight", "text": "string" },
    { "label": "After 1am", "text": "string" }
  ],
  "quote": "string"
}
      `.trim();

    case 'nature':
      return `
You are writing the right-side detail panel for a travel postcard.

${anchorBlock}

${DETAIL_PANEL_WRITER_RULES}

Content rules:
- headline: light quality plus dominant scent or air quality, 4–6 words total.
- body: exactly 2 paragraphs.
  Paragraph 1: physical sensation outdoors — air, smell, geography.
  Paragraph 2: specific light quality and what time of day it peaks.
- meta: exactly 4 items — rain days per year, average temperature for the current month, light quality description, scent profile.

Return JSON with this exact shape:
{
  "location": "${anchorLocation.location}",
  "eyebrow": "How this city breathes",
  "headline": "string",
  "body": ["string", "string"],
  "meta": [
    { "label": "string", "value": "string" },
    { "label": "string", "value": "string" },
    { "label": "string", "value": "string" },
    { "label": "string", "value": "string" }
  ]
}
      `.trim();

    case 'quiet':
      return `
You are writing the right-side detail panel for a travel postcard.

${anchorBlock}

${DETAIL_PANEL_WRITER_RULES}

Content rules:
- headline: must be exactly "The city between the city".
- body: one short paragraph of exactly 2 sentences — emotional register only, no facts or recommendations.
- timeFragments: exactly 3 items with labels for morning, afternoon, and dusk (or equivalent). Each text is 2–3 sentences: Murakami-style, specific and sensory, no recommendations.
- quote: one closing line, philosophical, not descriptive.

Return JSON with this exact shape:
{
  "location": "${anchorLocation.location}",
  "eyebrow": "Small moments",
  "headline": "The city between the city",
  "body": "string",
  "timeFragments": [
    { "label": "string", "text": "string" },
    { "label": "string", "text": "string" },
    { "label": "string", "text": "string" }
  ],
  "quote": "string"
}
      `.trim();

    default:
      throw new Error(`Unsupported detail panel category: ${category}`);
  }
}

async function generatePostcardDetailPanel({ city, category, anchorLocation }) {
  const normalizedCity = String(city || '').trim();
  const normalizedCategory = String(category || '').trim().toLowerCase();

  if (!normalizedCity) {
    throw new Error('City is required for detail panel generation.');
  }

  if (!DETAIL_PANEL_CATEGORIES.has(normalizedCategory)) {
    throw new Error('Invalid detail panel category.');
  }

  if (!anchorLocation?.location) {
    throw new Error('Anchor location is required for detail panel generation.');
  }

  const prompt = buildDetailPanelPrompt(normalizedCity, normalizedCategory, anchorLocation);
  const model = getGenerativeModel();

  let result;

  try {
    result = await model.generateContent(prompt);
  } catch (error) {
    throw new Error(`Gemini API request failed: ${error.message}`);
  }

  const rawText = result.response.text().trim();

  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  let content;

  try {
    content = JSON.parse(cleanJsonPayload(rawText));
  } catch (error) {
    throw new Error(`Failed to parse Gemini detail panel JSON: ${error.message}`);
  }

  content.location = anchorLocation.location;

  return {
    category: normalizedCategory,
    city: normalizedCity,
    anchorLocation,
    content,
  };
}

async function generateCityAiStamp(city, country = '') {
  const normalizedCity = String(city || '').trim();
  const normalizedCountry = String(country || '').trim() || 'Unknown';

  if (!normalizedCity) {
    throw new Error('City is required for AI stamp generation.');
  }

  const prompt = `
You are designing a vintage passport city stamp identity for ${normalizedCity}, ${normalizedCountry}.
The stamp represents the whole city identity, not any single postcard, trip, or neighborhood.

Return strict JSON only:
{
  "city": "${normalizedCity}",
  "country": "${normalizedCountry}",
  "landmark": "string — the city's most iconic building or landmark in English",
  "nature": "string — the city's most representative natural element in English",
  "food": "string — the city's most representative food or cultural flavor element in English",
  "colorPalette": "string — 3-5 color words, e.g. warm amber, muted red, deep brown",
  "stampStyle": "vintage city passport stamp"
}

Rules:
- All values must be in English.
- landmark, nature, and food must be specific to ${normalizedCity}, not generic travel copy.
- Do not mention a single restaurant, hotel, or current event.
  `.trim();

  const model = getGenerativeModel();
  let result;

  try {
    result = await model.generateContent(prompt);
  } catch (error) {
    throw new Error(`Gemini API request failed: ${error.message}`);
  }

  const rawText = result.response.text().trim();

  if (!rawText) {
    throw new Error('Gemini returned an empty AI stamp response.');
  }

  let stamp;

  try {
    stamp = JSON.parse(cleanJsonPayload(rawText));
  } catch (error) {
    throw new Error(`Failed to parse AI stamp JSON: ${error.message}`);
  }

  return {
    city: String(stamp.city || normalizedCity).trim(),
    country: String(stamp.country || normalizedCountry).trim(),
    landmark: String(stamp.landmark || '').trim(),
    nature: String(stamp.nature || '').trim(),
    food: String(stamp.food || '').trim(),
    colorPalette: String(stamp.colorPalette || 'warm amber, muted red, deep brown').trim(),
    stampStyle: String(stamp.stampStyle || 'vintage city passport stamp').trim(),
  };
}

module.exports = {
  generateCityAiStamp,
  generateCityAtmosphere,
  generatePostcardCaption,
  generatePostcardDetailPanel,
  pickAnchorLocation,
  preferencesToCategory,
  DETAIL_PANEL_CATEGORIES,
};