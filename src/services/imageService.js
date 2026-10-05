const { GoogleGenAI } = require('@google/genai');

const PROJECT_ID = process.env.VERTEX_PROJECT_ID;
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image';

let client;

function getClient() {
  client ||= new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: LOCATION,
  });
  return client;
}

function buildImagePrompt(atmosphere, city, preferences = [], anchorLocation = null) {
  const anchor = anchorLocation || atmosphere?.anchorLocation;
  const style =
    'shot on Kodak Portra 400, film grain, polaroid white border, warm nostalgic atmosphere, no text, no watermark';

  if (anchor?.location) {
    const place = anchor.location;
    const type = anchor.type || 'landmark';

    // User preferences take priority over anchor type
    const primary = preferences[0];

    if (primary === 'Food' || type === 'restaurant' || type === 'food') {
      return `A postcard-style close-up photograph of food at ${place} in ${city}, warm lighting, intimate setting, steam or texture visible, cinematic, ${style}`;
    }
    if (primary === 'Nightlife' || type === 'venue') {
      return `A postcard-style nighttime photograph of ${place} in ${city}, neon signs, bar lights, wet pavement reflections, cinematic, ${style}`;
    }
    if (primary === 'Nature' || type === 'park') {
      return `A postcard-style photograph of ${place} in ${city}, park or trail, dappled sunlight through trees, quiet and green, cinematic, ${style}`;
    }
    if (primary === 'Quiet Moments' || type === 'street') {
      return `A postcard-style photograph of ${place} in ${city}, quiet side street or empty café, soft afternoon light, no crowds, intimate and still, cinematic, ${style}`;
    }
    if (primary === 'Landmarks' || type === 'landmark') {
      return `A postcard-style photograph of ${place} at golden hour, warm light on recognizable architecture, civic foreground, cinematic, ${style}`;
    }

    return `A postcard-style photograph of ${place} in ${city}, cinematic composition, ${style}`;
  }

  // No anchor — fall back to preference-based generic prompts
  if (preferences.includes('Food')) {
    const food = atmosphere.localFood?.[0]?.name || 'local street food';
    return `A close-up film photograph of ${food} in ${city}. The dish is on a table or held in hands, warm lighting, intimate setting, steam or texture visible. ${style}`;
  }
  if (preferences.includes('Landmarks')) {
    const place = atmosphere.localPlaces?.[0]?.name || `a famous landmark in ${city}`;
    return `A cinematic film photograph of ${place} in ${city}. Wide shot, golden hour light, recognizable architecture. ${style}`;
  }
  if (preferences.includes('Nightlife')) {
    return `A nighttime street scene in ${city}, neon signs, bar lights, people walking, wet pavement reflections. ${style}`;
  }
  if (preferences.includes('Nature')) {
    return `A nature scene in ${city}, park or trail, dappled sunlight through trees, quiet and green. ${style}`;
  }
  if (preferences.includes('Quiet Moments')) {
    return `A quiet side street or empty café in ${city}, soft afternoon light, no crowds, intimate and still. ${style}`;
  }

  return `${atmosphere.imagePrompt || `A cinematic scene of ${city}`}, ${style}`;
}

async function generatePostcardImage(atmosphere, city, anchorLocation = null) {
  if (!PROJECT_ID) {
    throw new Error('Missing VERTEX_PROJECT_ID in .env file.');
  }

  const preferences = atmosphere.preferences || [];
  const anchor = anchorLocation || atmosphere?.anchorLocation || null;

  const prompt = buildImagePrompt(atmosphere, city, preferences, anchor);

  let response;

  try {
    response = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: '4:3',
          personGeneration: 'ALLOW_ADULT',
        },
      },
    });
  } catch (error) {
    throw new Error(`Gemini image API request failed: ${error.message}`);
  }

  const candidates = response.candidates || [];
  const parts = candidates.flatMap((candidate) => candidate.content?.parts || []);
  const image = parts.find((part) =>
    part.inlineData?.data && part.inlineData?.mimeType?.startsWith('image/')
  )?.inlineData;

  if (!image) {
    const diagnostics = {
      finishReason: candidates.map((candidate) => candidate.finishReason || 'UNKNOWN'),
      text: parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join('\n'),
      promptFeedback: response.promptFeedback || null,
    };
    const message = `Gemini returned no image inlineData: ${JSON.stringify(diagnostics)}`;
    console.error(message);
    throw new Error(message);
  }

  const imageBase64 = image.data;

  return {
    imageBase64,
    mimeType: image.mimeType,
    prompt,
  };
}

module.exports = {
  generatePostcardImage,
};
