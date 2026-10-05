const { generateCityAiStamp } = require('./geminiService');

function normalizeCityName(city) {
  const trimmed = String(city || '').trim();

  if (!trimmed) {
    return '';
  }

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeCountryName(country) {
  const trimmed = String(country || '').trim();

  if (!trimmed) {
    return '';
  }

  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function getOrCreateCityAiStamp(database, userId, cityName, countryName = '') {
  const citiesCollection = database.collection('cities');
  const normalizedCity = normalizeCityName(cityName);
  const normalizedCountry = normalizeCountryName(countryName);

  if (!normalizedCity) {
    throw new Error('A city name is required to create an AI stamp.');
  }

  const lookup = {
    userId,
    cityName: normalizedCity,
    countryName: normalizedCountry,
  };

  const existingCity = await citiesCollection.findOne(lookup);

  if (existingCity?.aiStamp) {
    return {
      aiStamp: existingCity.aiStamp,
      cityId: existingCity._id.toString(),
      countryName: existingCity.countryName || normalizedCountry,
      isNew: false,
    };
  }

  const generatedStamp = await generateCityAiStamp(normalizedCity, normalizedCountry || 'Unknown');
  const now = new Date();
  const aiStamp = {
    ...generatedStamp,
    createdAt: now,
  };
  const resolvedCountry = normalizedCountry || generatedStamp.country || 'Unknown';

  if (existingCity) {
    await citiesCollection.updateOne(
      { _id: existingCity._id },
      {
        $set: {
          aiStamp,
          countryName: resolvedCountry,
          updatedAt: now,
        },
      }
    );

    return {
      aiStamp,
      cityId: existingCity._id.toString(),
      countryName: resolvedCountry,
      isNew: true,
    };
  }

  const insertResult = await citiesCollection.insertOne({
    userId,
    cityName: normalizedCity,
    countryName: resolvedCountry,
    aiStamp,
    createdAt: now,
    updatedAt: now,
  });

  return {
    aiStamp,
    cityId: insertResult.insertedId.toString(),
    countryName: resolvedCountry,
    isNew: true,
  };
}

async function enrichPostcardsWithAiStamps(database, userId, postcards) {
  if (!Array.isArray(postcards) || postcards.length === 0) {
    return postcards;
  }

  const cityDocs = await database.collection('cities').find({ userId }).toArray();
  const stampByExactKey = new Map();
  const stampByCityOnly = new Map();

  for (const cityDoc of cityDocs) {
    if (!cityDoc?.aiStamp) {
      continue;
    }

    const cityKey = normalizeCityName(cityDoc.cityName);
    const countryKey = normalizeCountryName(cityDoc.countryName);
    stampByExactKey.set(`${cityKey}::${countryKey}`, cityDoc.aiStamp);

    if (!stampByCityOnly.has(cityKey)) {
      stampByCityOnly.set(cityKey, cityDoc.aiStamp);
    }
  }

  return postcards.map((postcard) => {
    const cityKey = normalizeCityName(postcard.city);
    const countryKey = normalizeCountryName(postcard.countryName);
    const aiStamp =
      postcard.aiStamp ||
      stampByExactKey.get(`${cityKey}::${countryKey}`) ||
      stampByCityOnly.get(cityKey) ||
      null;

    return {
      ...postcard,
      countryName: postcard.countryName || countryKey || '',
      aiStamp,
    };
  });
}

module.exports = {
  enrichPostcardsWithAiStamps,
  getOrCreateCityAiStamp,
  normalizeCityName,
  normalizeCountryName,
};
