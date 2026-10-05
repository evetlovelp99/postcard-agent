function pickEnglishCityName(data) {
  const address = data.address || {};
  const namedetails = data.namedetails || {};

  const fromColonEn =
    (address['city:en'] && String(address['city:en']).trim()) ||
    (address['town:en'] && String(address['town:en']).trim()) ||
    (address['village:en'] && String(address['village:en']).trim()) ||
    '';

  if (fromColonEn) {
    return fromColonEn;
  }

  const fromNamedetails =
    (namedetails['name:en'] && String(namedetails['name:en']).trim()) ||
    (namedetails['official_name:en'] && String(namedetails['official_name:en']).trim()) ||
    '';

  if (fromNamedetails) {
    return fromNamedetails;
  }

  return (
    (address.city && String(address.city).trim()) ||
    (address.town && String(address.town).trim()) ||
    (address.village && String(address.village).trim()) ||
    ''
  );
}

async function reverseGeocode(req, res, next) {
  try {
    const lat = Number.parseFloat(req.query.lat);
    const lon = Number.parseFloat(req.query.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({
        success: false,
        error: 'Valid lat and lon query parameters are required.',
      });
    }

    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/reverse');
    nominatimUrl.searchParams.set('lat', String(lat));
    nominatimUrl.searchParams.set('lon', String(lon));
    nominatimUrl.searchParams.set('format', 'json');
    nominatimUrl.searchParams.set('accept-language', 'en');
    nominatimUrl.searchParams.set('namedetails', '1');

    const response = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'PostCardAgent/1.0',
        Accept: 'application/json',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: 'Reverse geocoding service returned an error.',
      });
    }

    const data = await response.json();
    const cityName = pickEnglishCityName(data);
    const address = data.address || {};
    const country =
      (address['country:en'] && String(address['country:en']).trim()) ||
      (address.country && String(address.country).trim()) ||
      '';

    if (!cityName) {
      return res.status(404).json({
        success: false,
        error: 'Could not determine a city name for this location.',
      });
    }

    return res.json({
      success: true,
      data: { city: cityName, country },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  reverseGeocode,
};
