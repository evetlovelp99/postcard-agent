import './AiCityStamp.css';

const DEFAULT_PALETTE = {
  primary: '#b8845a',
  accent: '#8f4f45',
  ink: '#4a3428',
};

const CATEGORY_ICONS = {
  landmarks: '🏛',
  food: '🍜',
  quiet: '☕',
  nightlife: '🌃',
  nature: '🌿',
};

const CATEGORY_LABELS = {
  landmarks: 'Landmarks',
  food: 'Food',
  quiet: 'Quiet',
  nightlife: 'Nightlife',
  nature: 'Nature',
};

function parseColorPalette(colorPalette) {
  const paletteText = String(colorPalette || '').toLowerCase();
  const paletteMap = {
    amber: '#c99257',
    gold: '#c99257',
    brown: '#6b4a34',
    red: '#9f4c42',
    rust: '#9f4c42',
    green: '#4d6b5f',
    blue: '#50657b',
    teal: '#4d6b5f',
    cream: '#f0dcc2',
    sand: '#d4a574',
    charcoal: '#2a211c',
    navy: '#1d2334',
  };

  const matches = Object.entries(paletteMap)
    .filter(([keyword]) => paletteText.includes(keyword))
    .map(([, color]) => color);

  if (matches.length >= 2) {
    return {
      primary: matches[0],
      accent: matches[1],
      ink: matches[2] || DEFAULT_PALETTE.ink,
    };
  }

  return DEFAULT_PALETTE;
}

function formatStampDate(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
      .format(new Date())
      .toUpperCase()
      .replace(' ', ' ');
  }

  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
    .format(date)
    .toUpperCase()
    .replace(' ', ' ');
}

function normalizeCategoryId(category) {
  const value = String(category || '').trim().toLowerCase();

  if (CATEGORY_ICONS[value]) {
    return value;
  }

  const labelMap = {
    landmarks: 'landmarks',
    food: 'food',
    'quiet moments': 'quiet',
    quiet: 'quiet',
    nightlife: 'nightlife',
    nature: 'nature',
  };

  return labelMap[value] || 'landmarks';
}

function resolveCategoryLabel(categoryId) {
  return CATEGORY_LABELS[categoryId] || CATEGORY_LABELS.landmarks;
}

function resolveCategoryIcon(categoryId) {
  return CATEGORY_ICONS[categoryId] || CATEGORY_ICONS.landmarks;
}

function buildFallbackStamp(cityName) {
  return {
    city: cityName || 'Unknown',
    country: 'Unknown',
    colorPalette: 'warm amber, muted red, deep brown',
    createdAt: null,
  };
}

export default function AiCityStamp({
  aiStamp,
  cityName = '',
  category = 'landmarks',
  size = 'badge',
  className = '',
}) {
  const stamp = aiStamp || buildFallbackStamp(cityName);
  const colors = parseColorPalette(stamp.colorPalette);
  const categoryId = normalizeCategoryId(category);
  const stampCity = String(stamp.city || cityName || 'Unknown').toUpperCase();
  const stampDate = formatStampDate(stamp.createdAt);
  const categoryLabel = resolveCategoryLabel(categoryId);
  const categoryIcon = resolveCategoryIcon(categoryId);
  const sizeClass =
    size === 'sm' ? 'ai-city-stamp--sm' : size === 'md' ? 'ai-city-stamp--md' : 'ai-city-stamp--badge';

  return (
    <div
      className={`ai-city-stamp ${sizeClass} ${className}`.trim()}
      style={{
        '--stamp-primary': colors.primary,
        '--stamp-accent': colors.accent,
        '--stamp-ink': colors.ink,
      }}
      aria-label={`Collection badge for ${stampCity}`}
    >
      <svg className="ai-city-stamp__svg" viewBox="0 0 80 80" role="img" aria-hidden="true">
        <circle cx="40" cy="40" r="36" className="ai-city-stamp__ring" />
        <circle cx="40" cy="40" r="31" className="ai-city-stamp__face" />
        <text x="40" y="18" textAnchor="middle" className="ai-city-stamp__city">
          {stampCity.length > 10 ? `${stampCity.slice(0, 10)}…` : stampCity}
        </text>
        <text x="40" y="42" textAnchor="middle" className="ai-city-stamp__icon">
          {categoryIcon}
        </text>
        <text x="40" y="56" textAnchor="middle" className="ai-city-stamp__category">
          {categoryLabel}
        </text>
        <text x="40" y="68" textAnchor="middle" className="ai-city-stamp__date">
          {stampDate}
        </text>
      </svg>
    </div>
  );
}

export {
  buildFallbackStamp,
  formatStampDate,
  normalizeCategoryId,
  resolveCategoryLabel,
};
