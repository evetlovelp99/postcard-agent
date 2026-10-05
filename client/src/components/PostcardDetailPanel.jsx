import { useEffect, useState } from 'react';
import './PostcardDetailPanel.css';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);

const VALID_CATEGORIES = new Set(['landmarks', 'food', 'nightlife', 'nature', 'quiet']);

const CATEGORY_EYEBROWS = {
  landmarks: 'Why this place',
  food: 'The taste in this image',
  nightlife: 'City character after dark',
  nature: 'How this city breathes',
  quiet: 'Small moments',
};

async function fetchDetailPanel(city, category, anchorLocation) {
  const response = await fetch(`${API_BASE}/api/postcards/detail-panel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ city, category, anchorLocation }),
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Could not load detail panel.');
  }

  return payload.data.content;
}

function normalizeBody(body) {
  if (Array.isArray(body)) {
    return body.map((paragraph) => String(paragraph).trim()).filter(Boolean);
  }

  if (typeof body === 'string' && body.trim()) {
    return [body.trim()];
  }

  return [];
}

function DetailEyebrow({ category, content }) {
  return <p className="detail-panel__eyebrow">{content?.eyebrow || CATEGORY_EYEBROWS[category]}</p>;
}

function DetailHeadline({ children }) {
  return <h2 className="detail-panel__headline">{children}</h2>;
}

function DetailBody({ paragraphs }) {
  return paragraphs.map((paragraph) => (
    <p key={paragraph} className="detail-panel__body">
      {paragraph}
    </p>
  ));
}

function MetaGrid({ items = [] }) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="detail-panel__meta">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`}>
          <span className="detail-panel__meta-label">{item.label}</span>
          <span className="detail-panel__meta-value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function DetailQuote({ children }) {
  if (!children) {
    return null;
  }

  return <blockquote className="detail-panel__quote">{children}</blockquote>;
}

function TimeFragments({ fragments = [] }) {
  if (!fragments.length) {
    return null;
  }

  return (
    <div className="detail-panel__fragments">
      {fragments.map((fragment) => (
        <div key={fragment.label}>
          <span className="detail-panel__fragment-label">{fragment.label}</span>
          <p className="detail-panel__fragment-text">{fragment.text}</p>
        </div>
      ))}
    </div>
  );
}

function AtmosphereBars({ bars = [] }) {
  if (!bars.length) {
    return null;
  }

  return (
    <div className="detail-panel__bars">
      {bars.map((bar) => {
        const value = Math.max(0, Math.min(100, Number(bar.value) || 0));

        return (
          <div key={bar.label}>
            <div className="detail-panel__bar-row">
              <span>{bar.label}</span>
              <span>{value}</span>
            </div>
            <div className="detail-panel__bar-track">
              <div className="detail-panel__bar-fill" style={{ width: `${value}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DetailTags({ tags = [] }) {
  if (!tags.length) {
    return null;
  }

  return (
    <div className="detail-panel__tags">
      {tags.map((tag) => (
        <span key={tag} className="detail-panel__tag">
          {tag}
        </span>
      ))}
    </div>
  );
}

function LandmarksLayout({ content, category }) {
  return (
    <>
      <DetailEyebrow category={category} content={content} />
      <DetailHeadline>{content.headline}</DetailHeadline>
      <DetailBody paragraphs={normalizeBody(content.body)} />
      <MetaGrid items={content.meta} />
      <DetailQuote>{content.quote}</DetailQuote>
    </>
  );
}

function FoodLayout({ content, category }) {
  return (
    <>
      <DetailEyebrow category={category} content={content} />
      <DetailHeadline>{content.headline}</DetailHeadline>
      <DetailBody paragraphs={normalizeBody(content.body)} />
      <AtmosphereBars bars={content.atmosphere} />
      <DetailQuote>{content.quote}</DetailQuote>
      <DetailTags tags={content.tags} />
    </>
  );
}

function NightlifeLayout({ content, category }) {
  return (
    <>
      <DetailEyebrow category={category} content={content} />
      <DetailHeadline>{content.headline}</DetailHeadline>
      <DetailBody paragraphs={normalizeBody(content.body)} />
      <TimeFragments fragments={content.timeFragments} />
      <DetailQuote>{content.quote}</DetailQuote>
    </>
  );
}

function NatureLayout({ content, category }) {
  return (
    <>
      <DetailEyebrow category={category} content={content} />
      <DetailHeadline>{content.headline}</DetailHeadline>
      <DetailBody paragraphs={normalizeBody(content.body)} />
      <MetaGrid items={content.meta} />
    </>
  );
}

function QuietLayout({ content, category }) {
  return (
    <>
      <DetailEyebrow category={category} content={content} />
      <DetailHeadline>The city between the city</DetailHeadline>
      <DetailBody paragraphs={normalizeBody(content.body)} />
      <TimeFragments fragments={content.timeFragments} />
      <DetailQuote>{content.quote}</DetailQuote>
    </>
  );
}

function getPostcardMetaItems(content) {
  if (content.meta?.length) {
    return content.meta;
  }

  if (content.timeFragments?.length) {
    return content.timeFragments.map((fragment) => ({
      label: fragment.label,
      value: fragment.text,
    }));
  }

  return [];
}

function PostcardMoodDetailsContent({ category, content }) {
  const paragraphs = normalizeBody(content.body);
  const metaItems = getPostcardMetaItems(content);
  const headline = category === 'quiet' ? 'The city between the city' : content.headline;

  return (
    <>
      <DetailEyebrow category={category} content={content} />
      <DetailHeadline>{headline}</DetailHeadline>
      {paragraphs.length > 0 ? <DetailBody paragraphs={paragraphs} /> : null}
      {metaItems.length > 0 ? <MetaGrid items={metaItems} /> : null}
      {!metaItems.length && content.atmosphere?.length ? (
        <AtmosphereBars bars={content.atmosphere} />
      ) : null}
    </>
  );
}

function CategoryLayout({ category, content, layout = 'full' }) {
  if (layout === 'postcard') {
    return <PostcardMoodDetailsContent category={category} content={content} />;
  }

  switch (category) {
    case 'landmarks':
      return <LandmarksLayout content={content} category={category} />;
    case 'food':
      return <FoodLayout content={content} category={category} />;
    case 'nightlife':
      return <NightlifeLayout content={content} category={category} />;
    case 'nature':
      return <NatureLayout content={content} category={category} />;
    case 'quiet':
      return <QuietLayout content={content} category={category} />;
    default:
      return null;
  }
}

export function preferenceToCategory(preferenceIds = [], atmospherePreferences = []) {
  if (preferenceIds.length > 0) {
    const id = preferenceIds[0];

    if (VALID_CATEGORIES.has(id)) {
      return id;
    }
  }

  const labelMap = {
    Landmarks: 'landmarks',
    Food: 'food',
    'Quiet Moments': 'quiet',
    Nightlife: 'nightlife',
    Nature: 'nature',
  };

  if (atmospherePreferences.length > 0) {
    return labelMap[atmospherePreferences[0]] || null;
  }

  return null;
}

export default function PostcardDetailPanel({
  category,
  city,
  anchorLocation,
  layout = 'full',
  onContentLoaded,
}) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!category || !city || !VALID_CATEGORIES.has(category) || !anchorLocation?.location) {
      setContent(null);
      setLoading(false);
      setError(anchorLocation?.location ? '' : 'No anchor location for this postcard.');
      return undefined;
    }

    let cancelled = false;

    async function loadPanel() {
      setLoading(true);
      setError('');
      setContent(null);

      try {
        const data = await fetchDetailPanel(city, category, anchorLocation);

        if (!cancelled) {
          setContent(data);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPanel();

    return () => {
      cancelled = true;
    };
  }, [category, city, anchorLocation]);

  useEffect(() => {
    if (!content || !onContentLoaded) {
      return;
    }

    onContentLoaded(content);
  }, [content, onContentLoaded]);

  if (!category || !VALID_CATEGORIES.has(category)) {
    return null;
  }

  const panelClassName = [
    'detail-panel',
    layout === 'postcard' ? 'detail-panel--postcard' : '',
    loading ? 'detail-panel--loading' : '',
    error ? 'detail-panel--error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (loading) {
    return (
      <aside className={panelClassName} aria-live="polite">
        <p className="detail-panel__status">Composing details...</p>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className={panelClassName} aria-live="polite">
        <p className="detail-panel__status detail-panel__status--error">{error}</p>
      </aside>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <aside className={panelClassName}>
      <CategoryLayout category={category} content={content} layout={layout} />
    </aside>
  );
}
