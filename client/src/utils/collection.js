export function getCountryFlag(countryName) {
  const flags = {
    China: '🇨🇳',
    Japan: '🇯🇵',
    'United States': '🇺🇸',
    USA: '🇺🇸',
    France: '🇫🇷',
    Italy: '🇮🇹',
    Spain: '🇪🇸',
    Germany: '🇩🇪',
    'United Kingdom': '🇬🇧',
    UK: '🇬🇧',
    Portugal: '🇵🇹',
    Brazil: '🇧🇷',
    Mexico: '🇲🇽',
    Canada: '🇨🇦',
    Australia: '🇦🇺',
    India: '🇮🇳',
    Thailand: '🇹🇭',
    Vietnam: '🇻🇳',
    'South Korea': '🇰🇷',
    Singapore: '🇸🇬',
  };

  return flags[countryName] || '🌍';
}

const NON_LATIN_CITY_PATTERN = /[\u4e00-\u9fff\u3040-\u30ff\u3400-\u4dbf\uac00-\ud7af]/;

export function isAsciiCityName(value) {
  const text = String(value || '').trim();

  return text.length > 0 && !NON_LATIN_CITY_PATTERN.test(text);
}

export function resolveCanonicalCityName(postcard, normalizeCityName) {
  const candidates = [postcard?.aiStamp?.city, postcard?.city]
    .map((value) => normalizeCityName(value))
    .filter(Boolean);

  const asciiCandidate = candidates.find(isAsciiCityName);

  if (asciiCandidate) {
    return asciiCandidate;
  }

  return candidates[0] || 'Unknown';
}

export function resolveCountryName(postcard) {
  const candidates = [postcard?.countryName, postcard?.aiStamp?.country]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return candidates.find((name) => name !== 'Unknown') || '';
}

function buildCityCountryHints(postcards, normalizeCityName) {
  const hints = new Map();

  for (const postcard of postcards) {
    const cityName = resolveCanonicalCityName(postcard, normalizeCityName);
    const countryName = resolveCountryName(postcard);

    if (cityName && countryName && !hints.has(cityName)) {
      hints.set(cityName, countryName);
    }
  }

  return hints;
}

function resolveCategoryFromPostcard(postcard) {
  const preference = postcard?.atmosphere?.preferences?.[0];

  if (!preference) {
    return 'landmarks';
  }

  const labelMap = {
    Landmarks: 'landmarks',
    Food: 'food',
    'Quiet Moments': 'quiet',
    Nightlife: 'nightlife',
    Nature: 'nature',
  };

  return labelMap[preference] || String(preference).toLowerCase();
}

export function groupPostcardsByCountryAndCity(postcards, normalizeCityName) {
  const cityCountryHints = buildCityCountryHints(postcards, normalizeCityName);
  const countries = new Map();

  for (const postcard of postcards) {
    if (postcard.isFavorited) {
      continue;
    }

    const cityName = resolveCanonicalCityName(postcard, normalizeCityName);
    let countryName = resolveCountryName(postcard) || cityCountryHints.get(cityName) || '';

    if (!countryName) {
      continue;
    }

    if (!countries.has(countryName)) {
      countries.set(countryName, new Map());
    }

    const cityMap = countries.get(countryName);

    if (!cityMap.has(cityName)) {
      cityMap.set(cityName, []);
    }

    cityMap.get(cityName).push(postcard);
  }

  return Array.from(countries.entries())
    .map(([countryName, cityMap]) => {
      const cities = Array.from(cityMap.entries())
        .map(([cityName, items]) => {
          const sortedItems = [...items].sort(
            (left, right) => new Date(right.createdAt) - new Date(left.createdAt)
          );
          const latestAt = sortedItems.reduce((max, item) => {
            const createdAt = new Date(item.createdAt).getTime();
            return Number.isNaN(createdAt) ? max : Math.max(max, createdAt);
          }, 0);
          const aiStamp = sortedItems.find((item) => item.aiStamp)?.aiStamp || null;
          const category = resolveCategoryFromPostcard(sortedItems[0]);

          return {
            cityName,
            countryName,
            items: sortedItems,
            latestAt,
            aiStamp,
            category,
            postcardCount: sortedItems.length,
          };
        })
        .sort((left, right) => right.latestAt - left.latestAt);

      const latestAt = cities.reduce((max, city) => Math.max(max, city.latestAt), 0);

      return {
        countryName,
        cities,
        latestAt,
      };
    })
    .filter((country) => country.countryName && country.countryName !== 'Unknown')
    .filter((country) => country.cities.length > 0)
    .sort((left, right) => right.latestAt - left.latestAt);
}

export function countPostcardsForCity(postcards, cityName, normalizeCityName) {
  const normalizedTarget = resolveCanonicalCityName({ city: cityName }, normalizeCityName);

  return postcards.filter(
    (postcard) =>
      resolveCanonicalCityName(postcard, normalizeCityName) === normalizedTarget &&
      !postcard.isFavorited
  ).length;
}

export function formatMonthYear(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
}

export function findCityGroupForPostcard(historyByCountry, postcard, normalizeCityName) {
  const targetCity = resolveCanonicalCityName(postcard, normalizeCityName);

  for (const countryGroup of historyByCountry) {
    const cityGroup = countryGroup.cities.find((group) => group.cityName === targetCity);

    if (cityGroup) {
      return cityGroup;
    }
  }

  return null;
}
