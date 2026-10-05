const { ObjectId } = require('mongodb');

const { getDatabase } = require('../config/database');
const {
  generateCityAtmosphere,
  generatePostcardCaption,
  generatePostcardDetailPanel,
  pickAnchorLocation,
  preferencesToCategory,
  DETAIL_PANEL_CATEGORIES,
} = require('../services/geminiService');
const { generatePostcardImage } = require('../services/imageService');
const { isSmtpConfigured, sendPostcardEmail } = require('../services/mailService');
const {
  enrichPostcardsWithAiStamps,
  getOrCreateCityAiStamp,
  normalizeCityName,
} = require('../services/cityService');
const { buildUserIdQuery, getUserId } = require('../utils/userId');

function normalizeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

const ALLOWED_PREFERENCES = new Set([
  'Landmarks',
  'Food',
  'Quiet Moments',
  'Nightlife',
  'Nature',
]);

const PREFERENCE_ID_MAP = {
  landmarks: 'Landmarks',
  food: 'Food',
  quiet: 'Quiet Moments',
  nightlife: 'Nightlife',
  nature: 'Nature',
};

function normalizePreferences(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = [];

  for (const item of value) {
    const trimmed = String(item).trim();

    if (!trimmed) {
      continue;
    }

    if (ALLOWED_PREFERENCES.has(trimmed)) {
      normalized.push(trimmed);
      continue;
    }

    const fromId = PREFERENCE_ID_MAP[trimmed.toLowerCase()];

    if (fromId) {
      normalized.push(fromId);
    }
  }

  return [...new Set(normalized)];
}

async function createPostcard(req, res, next) {
  try {
    const city = normalizeCityName(req.body?.city);
    const countryName = String(req.body?.countryName || '').trim();
    const userId = getUserId(req);
    const preferences = normalizePreferences(req.body?.preferences);
    const regenerate = Boolean(req.body?.regenerate);
    const previousAnchorName = String(req.body?.previousAnchorName || '').trim();

    if (!city) {
      return res.status(400).json({
        success: false,
        error: 'The "city" field is required.',
      });
    }

    const database = await getDatabase();
    const postcardsCollection = database.collection('postcards');

    let stampResult = {
      aiStamp: null,
      cityId: null,
      countryName: countryName || '',
      isNew: false,
    };

    try {
      stampResult = await getOrCreateCityAiStamp(database, userId, city, countryName);
    } catch (stampError) {
      console.error('AI stamp generation failed:', stampError.message);
    }

    const recentMemories = await postcardsCollection
      .find(
        buildUserIdQuery(userId),
        {
          projection: {
            city: 1,
            atmosphere: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    // Step 1: Pick one anchor location for image + copy
    const anchorLocation = await pickAnchorLocation({
      city,
      preferences,
      regenerate,
      previousAnchorName,
    });

    // Step 2: Generate city atmosphere grounded to the anchor
    const generated = await generateCityAtmosphere({
      city,
      travelerId: userId,
      recentMemories,
      preferences,
      anchorLocation,
    });

    generated.atmosphere.preferences = preferences;
    generated.atmosphere.anchorLocation = anchorLocation;

    // Step 3: Generate postcard image at the same anchor
    let imageData = null;
    try {
      imageData = await generatePostcardImage(generated.atmosphere, city, anchorLocation);
    } catch (imageError) {
      // Image generation is non-blocking — postcard still saves without image
      console.error('Image generation failed:', imageError.message);
    }

    const category = preferencesToCategory(preferences);
    let caption = null;

    if (imageData?.imageBase64) {
      try {
        const imageUrl = `data:${imageData.mimeType || 'image/png'};base64,${imageData.imageBase64}`;
        caption = await generatePostcardCaption({ city, category, imageUrl });
      } catch (captionError) {
        console.error('Caption generation failed:', captionError.message);
      }
    }

    const postcard = {
      userId,
      travelerId: userId,
      city,
      countryName: stampResult.countryName,
      cityId: stampResult.cityId,
      aiStamp: stampResult.aiStamp,
      isFavorited: false,
      atmosphere: generated.atmosphere,
      caption,
      image: imageData
        ? {
            base64: imageData.imageBase64,
            mimeType: imageData.mimeType,
            prompt: imageData.prompt,
          }
        : null,
      prompt: generated.prompt,
      model: generated.model,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await postcardsCollection.insertOne(postcard);

    return res.status(201).json({
      success: true,
      data: {
        id: result.insertedId.toString(),
        userId,
        travelerId: userId,
        city,
        countryName: postcard.countryName,
        cityId: postcard.cityId,
        aiStamp: postcard.aiStamp,
        stampIsNew: stampResult.isNew,
        atmosphere: postcard.atmosphere,
        caption: postcard.caption,
        image: postcard.image,
        memoryContextCount: recentMemories.length,
        createdAt: postcard.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getRecentPostcards(req, res, next) {
  try {
    const userId = getUserId(req);
    const limit = normalizeLimit(req.query?.limit, 50);

    const database = await getDatabase();
    const postcards = await database
      .collection('postcards')
      .find(buildUserIdQuery(userId))
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const enrichedPostcards = await enrichPostcardsWithAiStamps(database, userId, postcards);

    return res.json({
      success: true,
      data: enrichedPostcards.map((postcard) => ({
        ...postcard,
        _id: postcard._id.toString(),
      })),
    });
  } catch (error) {
    return next(error);
  }
}

async function deletePostcard(req, res, next) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid postcard id.',
      });
    }

    const database = await getDatabase();
    const result = await database
      .collection('postcards')
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Postcard not found.',
      });
    }

    return res.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    return next(error);
  }
}

async function setPostcardFavorite(req, res, next) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid postcard id.',
      });
    }

    const isFavorited = Boolean(req.body?.isFavorited);
    const database = await getDatabase();
    const result = await database.collection('postcards').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { isFavorited, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Postcard not found.',
      });
    }

    return res.json({
      success: true,
      data: {
        id: result._id.toString(),
        isFavorited: Boolean(result.isFavorited),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getPostcardById(req, res, next) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid postcard id.',
      });
    }

    const database = await getDatabase();
    const postcard = await database
      .collection('postcards')
      .findOne({ _id: new ObjectId(id) });

    if (!postcard) {
      return res.status(404).json({
        success: false,
        error: 'Postcard not found.',
      });
    }

    const userId = postcard.userId || postcard.travelerId || getUserId(req);
    const [enrichedPostcard] = await enrichPostcardsWithAiStamps(database, userId, [postcard]);

    return res.json({
      success: true,
      data: {
        ...enrichedPostcard,
        _id: enrichedPostcard._id.toString(),
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function generateDetailPanel(req, res, next) {
  try {
    const city = req.body?.city?.trim();
    const category = String(req.body?.category || '')
      .trim()
      .toLowerCase();

    if (!city) {
      return res.status(400).json({
        success: false,
        error: 'The "city" field is required.',
      });
    }

    if (!DETAIL_PANEL_CATEGORIES.has(category)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid category. Use landmarks, food, nightlife, nature, or quiet.',
      });
    }

    const anchorLocation = req.body?.anchorLocation;

    if (!anchorLocation?.location) {
      return res.status(400).json({
        success: false,
        error: 'anchorLocation with location is required.',
      });
    }

    const data = await generatePostcardDetailPanel({ city, category, anchorLocation });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

async function getHealth(_req, res) {
  return res.json({
    success: true,
    data: {
      status: 'ok',
      service: 'postcard-agent-api',
      timestamp: new Date().toISOString(),
    },
  });
}

async function generatePostcardCaptionForPostcard(req, res, next) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid postcard id.',
      });
    }

    const database = await getDatabase();
    const postcardsCollection = database.collection('postcards');
    const postcard = await postcardsCollection.findOne({ _id: new ObjectId(id) });

    if (!postcard) {
      return res.status(404).json({
        success: false,
        error: 'Postcard not found.',
      });
    }

    const travelerId = postcard.travelerId || 'demo-user';

    if (!postcard.image?.base64) {
      return res.status(400).json({
        success: false,
        error: 'Postcard has no image. Caption requires a generated photo.',
      });
    }

    const category = preferencesToCategory(postcard.atmosphere?.preferences);
    const mimeType = postcard.image.mimeType || 'image/png';
    const imageUrl = `data:${mimeType};base64,${postcard.image.base64}`;

    const caption = await generatePostcardCaption({
      city: postcard.city,
      category,
      imageUrl,
    });

    await postcardsCollection.updateOne(
      { _id: postcard._id },
      { $set: { caption, updatedAt: new Date() } }
    );

    return res.json({
      success: true,
      data: { caption },
    });
  } catch (error) {
    return next(error);
  }
}

async function sendPostcardEmailHandler(req, res) {
  try {
    if (!isSmtpConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Email is not configured. Set SMTP_USER and SMTP_PASS in your environment.',
      });
    }

    const { recipientEmail, postcardImageBase64, caption, city } = req.body || {};

    if (!recipientEmail || typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'A valid recipientEmail is required.',
      });
    }

    await sendPostcardEmail({
      recipientEmail: recipientEmail.trim(),
      postcardImageBase64,
      caption: typeof caption === 'string' ? caption : '',
      city: typeof city === 'string' && city.trim() ? city.trim() : 'Postcard',
    });

    return res.json({
      success: true,
      data: { sent: true },
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: error.message || 'Failed to send email.',
    });
  }
}

module.exports = {
  createPostcard,
  deletePostcard,
  generateDetailPanel,
  generatePostcardCaptionForPostcard,
  getHealth,
  getPostcardById,
  getRecentPostcards,
  sendPostcardEmailHandler,
  setPostcardFavorite,
};