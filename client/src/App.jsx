import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import AiCityStamp from './components/AiCityStamp';
import PostcardDetailPanel, { preferenceToCategory } from './components/PostcardDetailPanel';
import {
  countPostcardsForCity,
  findCityGroupForPostcard,
  formatMonthYear,
  getCountryFlag,
  groupPostcardsByCountryAndCity,
  resolveCanonicalCityName,
} from './utils/collection';
import './App.css';

const USER_ID_STORAGE_KEY = 'postcard-agent:user-id';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);

function getOrCreateUserId() {
  try {
    let userId = localStorage.getItem(USER_ID_STORAGE_KEY);

    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem(USER_ID_STORAGE_KEY, userId);
    }

    return userId;
  } catch {
    return 'demo-user';
  }
}
const COLOR_LEXICON = [
  { keywords: ['amber', 'lantern', 'warm', 'gold'], color: '#d59657' },
  { keywords: ['rain', 'wet', 'drizzle', 'storm'], color: '#50657b' },
  { keywords: ['pink', 'blossom', 'spring', 'rose'], color: '#c790a3' },
  { keywords: ['night', 'midnight', 'shadow', 'dark'], color: '#1b2239' },
  { keywords: ['neon', 'jazz', 'violet', 'electric'], color: '#6e5dd4' },
  { keywords: ['steam', 'paper', 'matte', 'fog'], color: '#f0dcc2' },
  { keywords: ['green', 'temple', 'moss', 'forest'], color: '#4d6b5f' },
  { keywords: ['red', 'lanterns', 'crimson'], color: '#9f4c42' },
];
const FALLBACK_COLORS = ['#1d2334', '#4b536b', '#91664d', '#ecd2b2'];

const PREFERENCE_OPTIONS = [
  { id: 'landmarks', label: 'Landmarks' },
  { id: 'food', label: 'Food' },
  { id: 'quiet', label: 'Quiet Moments' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'nature', label: 'Nature' },
];

const STEP_TRANSITION_MS = 320;
const CAPTION_MAX_LENGTH = 120;

function getPreferenceLabels(preferenceIds) {
  return preferenceIds
    .map((id) => PREFERENCE_OPTIONS.find((option) => option.id === id)?.label)
    .filter(Boolean);
}

function getPostcardId(postcard) {
  return postcard?.id || postcard?._id || '';
}

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

function HeartIcon({ filled }) {
  return (
    <svg
      className={`card-action-icon${filled ? ' card-action-icon--filled' : ''}`}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="card-action-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
        fill="currentColor"
      />
    </svg>
  );
}

function HistoryCityCard({ cityGroup, onSelect }) {
  return (
    <button type="button" className="history-city-card" onClick={() => onSelect(cityGroup)}>
      <AiCityStamp
        aiStamp={cityGroup.aiStamp}
        cityName={cityGroup.cityName}
        category={cityGroup.category}
        size="sm"
      />
      <div className="history-city-card__body">
        <span className="history-city-card__name">{cityGroup.cityName}</span>
        <span className="history-city-card__meta">
          {cityGroup.postcardCount} postcard{cityGroup.postcardCount === 1 ? '' : 's'}
        </span>
        <span className="history-city-card__meta">
          Latest {formatMonthYear(cityGroup.latestAt)}
        </span>
      </div>
    </button>
  );
}

function HistoryPostcardCard({
  postcard,
  pendingDeleteId,
  onSelect,
  onToggleFavorite,
  onConfirmDelete,
  onDelete,
  onCancelDelete,
}) {
  const postcardId = getPostcardId(postcard);
  const thumbSrc = getPostcardImageSrc(postcard);
  const caption = readCaptionOverride(postcardId) ?? postcard.caption ?? '';
  const isFavorited = Boolean(postcard.isFavorited);
  const isConfirmingDelete = pendingDeleteId === postcardId;

  return (
    <div className="history-card">
      <div className="card-actions">
        <button
          type="button"
          className="card-action-button"
          aria-label={isFavorited ? 'Unfavorite postcard' : 'Favorite postcard'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(postcard);
          }}
        >
          <HeartIcon filled={isFavorited} />
        </button>
        <button
          type="button"
          className="card-action-button"
          aria-label="Delete postcard"
          onClick={(event) => {
            event.stopPropagation();
            onConfirmDelete(postcardId);
          }}
        >
          <TrashIcon />
        </button>
      </div>

      {isConfirmingDelete ? (
        <div className="history-card__confirm">
          <p className="history-card__confirm-text">Remove this postcard?</p>
          <div className="history-card__confirm-actions">
            <button
              type="button"
              className="button button--ghost history-card__confirm-button"
              onClick={() => onDelete(postcardId)}
            >
              Yes
            </button>
            <button
              type="button"
              className="button button--ghost history-card__confirm-button"
              onClick={onCancelDelete}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="history-card__select" onClick={() => onSelect(postcard)}>
          {thumbSrc ? (
            <img className="history-card__thumb" src={thumbSrc} alt="" />
          ) : (
            <span className="history-card__thumb history-card__thumb--empty" />
          )}
          <span className="history-card__body">
            <span className="history-card__date">{formatDate(postcard.createdAt)}</span>
            {caption ? <span className="history-card__caption">{caption}</span> : null}
          </span>
        </button>
      )}
    </div>
  );
}

function PostcardOverlay({ onClose, children }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="postcard-overlay" role="dialog" aria-modal="true" aria-label="Postcard detail">
      <div className="postcard-overlay__inner guided-step__inner guided-postcard-layout">{children}</div>
    </div>
  );
}

function PostcardFlipCard({
  captureRef,
  cardCaptureRef,
  visualStyle,
  imageSrc,
  displayCaption,
  showCaptionOverlay,
  autoCaptionLoading,
  captionMode,
  cityName,
  collectedNumber,
  createdAt,
  isFlipped,
  onToggleFlip,
}) {
  const backMessage =
    showCaptionOverlay
      ? displayCaption
      : captionMode === 'auto' && autoCaptionLoading
        ? 'Composing a line...'
        : '';

  return (
    <button
      ref={cardCaptureRef}
      type="button"
      className={`postcard-flip-scene${isFlipped ? ' postcard-flip-scene--flipped' : ''}`}
      onClick={onToggleFlip}
      aria-label={isFlipped ? 'Show postcard front' : 'Show postcard back'}
    >
      <div className="postcard-flip-card">
        <div
          ref={captureRef}
          className="postcard-flip-face postcard-flip-face--front postcard-photo"
          style={visualStyle}
        >
          {imageSrc ? (
            <img className="postcard-photo__image" src={imageSrc} alt="" decoding="sync" />
          ) : null}
        </div>

        <div className="postcard-flip-face postcard-flip-face--back">
          <div className="postcard-back postcard-back--paper">
            <div className="postcard-back__content postcard-back__content--simple">
              <div className="postcard-back__meta-block">
                <span className="postcard-back__meta-label">Collected No.</span>
                <span className="postcard-back__meta-value">
                  {collectedNumber ? String(collectedNumber).padStart(3, '0') : '001'}
                </span>
              </div>
              <div className="postcard-back__meta-block">
                <span className="postcard-back__meta-label">City</span>
                <span className="postcard-back__meta-value">{cityName || 'Unknown'}</span>
              </div>
              <div className="postcard-back__meta-block">
                <span className="postcard-back__meta-label">Date</span>
                <span className="postcard-back__meta-value">{formatShortDate(createdAt)}</span>
              </div>
              {backMessage ? (
                <p className="postcard-back__caption" aria-live="polite">
                  {backMessage}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

function PostcardDetailLayout({
  postcard,
  captureRef,
  visualStyle,
  imageSrc,
  displayCaption,
  showCaptionOverlay,
  autoCaptionLoading,
  captionMode,
  autoCaptionError,
  sendEmailExpanded,
  onToggleSendEmail,
  onDownloadPostcard,
  downloadLoading,
  recipientEmail,
  onRecipientEmailChange,
  onSendEmail,
  sendEmailStatus,
  sendEmailMessage,
  showCreationActions,
  onChangeVibe,
  onSameVibeNewSpot,
  onViewHistory,
  onClose,
  onBackHome,
  isGenerating,
  detailCategory,
  collectedNumber,
}) {
  const [isFlipped, setIsFlipped] = useState(false);
  const cardCaptureRef = useRef(null);
  const postcardId = getPostcardId(postcard);

  useEffect(() => {
    setIsFlipped(false);
  }, [postcardId]);

  return (
    <div className="guided-postcard-stack">
      <div className="guided-postcard-navigation">
        <button type="button" className="button button--ghost" onClick={onBackHome}>
          Back to home
        </button>
        <button type="button" className="button button--ghost" aria-label="Close postcard" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="guided-postcard-frame">
        <PostcardFlipCard
          captureRef={captureRef}
          cardCaptureRef={cardCaptureRef}
          visualStyle={visualStyle}
          imageSrc={imageSrc}
          displayCaption={displayCaption}
          showCaptionOverlay={showCaptionOverlay}
          autoCaptionLoading={autoCaptionLoading}
          captionMode={captionMode}
          cityName={postcard.city}
          collectedNumber={collectedNumber}
          createdAt={postcard.createdAt}
          isFlipped={isFlipped}
          onToggleFlip={() => setIsFlipped((flipped) => !flipped)}
        />
        {isGenerating ? (
          <div
            className="guided-postcard-frame__loading"
            aria-live="polite"
            aria-busy="true"
          >
            <p className="guided-postcard-frame__loading-text guided-loading guided-loading--pulse">
              Finding a new spot...
            </p>
          </div>
        ) : null}
      </div>

      {autoCaptionError ? <p className="callout callout--error">{autoCaptionError}</p> : null}

      <div className="guided-postcard-mood">
        {detailCategory && postcard.atmosphere?.anchorLocation ? (
          <PostcardDetailPanel
            layout="postcard"
            category={detailCategory}
            city={postcard.city}
            anchorLocation={postcard.atmosphere.anchorLocation}
          />
        ) : null}
      </div>

      <footer className="guided-postcard-footer">
        <div className="guided-actions guided-actions--postcard">
          <button
            type="button"
            className="button button--ghost button--icon"
            aria-label="Download postcard"
            disabled={downloadLoading}
            onClick={() => onDownloadPostcard(cardCaptureRef.current, isFlipped)}
          >
            ↓
          </button>
          <button
            type="button"
            className="button button--ghost button--icon"
            aria-label="Send via email"
            aria-expanded={sendEmailExpanded}
            onClick={onToggleSendEmail}
          >
            ✉
          </button>
          {showCreationActions ? (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={onChangeVibe}
                disabled={isGenerating}
              >
                Change Vibe
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={onSameVibeNewSpot}
                disabled={isGenerating}
              >
                Same Vibe, New Spot
              </button>
              <button type="button" className="button button--ghost" onClick={onViewHistory}>
                View History
              </button>
            </>
          ) : null}
        </div>

        {sendEmailExpanded ? (
          <form className="email-send-panel" onSubmit={onSendEmail}>
            <label className="email-send-field">
              <span>Recipient email</span>
              <input
                type="email"
                value={recipientEmail}
                onChange={(event) => onRecipientEmailChange(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>
            <button
              className="button button--primary email-send-submit"
              type="submit"
              disabled={sendEmailStatus === 'sending'}
            >
              {sendEmailStatus === 'sending' ? 'Sending...' : 'Send'}
            </button>
            {sendEmailMessage ? (
              <p
                className={`callout ${
                  sendEmailStatus === 'error' ? 'callout--error' : 'callout--success'
                }`}
              >
                {sendEmailMessage}
              </p>
            ) : null}
          </form>
        ) : null}
      </footer>
    </div>
  );
}

async function requestJson(path, options = {}) {
  const userId = getOrCreateUserId();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'x-user-id': userId,
      ...(options.headers || {}),
    },
  });
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'The postcard service is unavailable right now.');
  }

  return payload.data;
}

function getCurrentPositionAsync(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('NO_GEO'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function isAsciiOnlyText(value) {
  const text = String(value || '').trim();

  return text.length > 0 && /^[\x20-\x7E]+$/.test(text);
}

function pickAsciiAddressField(...candidates) {
  for (const candidate of candidates) {
    const text = String(candidate || '').trim();

    if (text && isAsciiOnlyText(text)) {
      return text;
    }
  }

  return '';
}

function readLocationFromNominatimPayload(data) {
  const address = data?.address || {};

  const city = pickAsciiAddressField(
    address.city,
    address.town,
    address.state,
    address.country
  );
  const country = pickAsciiAddressField(address.country);
  const pillCity = pickAsciiAddressField(address.city);
  const label = pillCity && country ? `${pillCity}, ${country}` : [pillCity, country].filter(Boolean).join(', ');

  return { city, country, label };
}

function readLocationFromGeocodeResult(data) {
  if (data?.address) {
    return readLocationFromNominatimPayload(data);
  }

  const city = pickAsciiAddressField(data?.city, data?.state, data?.country);
  const country = pickAsciiAddressField(data?.country);
  const label = [city, country].filter(Boolean).join(', ');

  return { city, country, label };
}

async function fetchLocationFromCoordinates(lat, lon) {
  try {
    const nominatim = new URL('https://nominatim.openstreetmap.org/reverse');
    nominatim.searchParams.set('lat', String(lat));
    nominatim.searchParams.set('lon', String(lon));
    nominatim.searchParams.set('format', 'json');
    nominatim.searchParams.set('accept-language', 'en');
    const url = nominatim.toString();
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'PostCardAgent/1.0',
        'Accept-Language': 'en',
      },
    });

    if (response.ok) {
      const data = await response.json();
      const location = readLocationFromNominatimPayload(data);

      if (location.city) {
        return location;
      }
    }
  } catch {
    // Nominatim may block browser cross-origin requests; fall back to the API proxy.
  }

  const payload = await requestJson(
    `/api/geolocation/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
  );

  return readLocationFromGeocodeResult(payload);
}

const LOCATION_UNAVAILABLE_MESSAGE = 'Location unavailable — please type your city';

function buildShareUrl(postcardId) {
  const url = new URL(window.location.href);

  if (postcardId) {
    url.searchParams.set('postcard', postcardId);
  } else {
    url.searchParams.delete('postcard');
  }

  return url.toString();
}

function syncShareUrl(postcardId) {
  window.history.replaceState({}, '', buildShareUrl(postcardId));
}

function readCaptionOverride(postcardId) {
  if (!postcardId) {
    return null;
  }

  try {
    return window.localStorage.getItem(`postcard-caption:${postcardId}`);
  } catch {
    return null;
  }
}

function writeCaptionOverride(postcardId, caption) {
  if (!postcardId) {
    return;
  }

  try {
    window.localStorage.setItem(`postcard-caption:${postcardId}`, caption);
  } catch {
    // Ignore storage errors in private browsing or restricted contexts.
  }
}

const LAST_POSTCARD_ID_KEY = 'postcard-agent:last-postcard-id';

function readLastPostcardId() {
  try {
    return window.localStorage.getItem(LAST_POSTCARD_ID_KEY);
  } catch {
    return null;
  }
}

function writeLastPostcardId(postcardId) {
  if (!postcardId) {
    return;
  }

  try {
    window.localStorage.setItem(LAST_POSTCARD_ID_KEY, postcardId);
  } catch {
    // Ignore storage errors in private browsing or restricted contexts.
  }
}

function clearLastPostcardId() {
  try {
    window.localStorage.removeItem(LAST_POSTCARD_ID_KEY);
  } catch {
    // Ignore storage errors in private browsing or restricted contexts.
  }
}

const POSTCARD_CAPTURE_STYLE_ID = 'postcard-html2canvas-capture';

function preparePostcardCloneForCapture(clonedDoc) {
  const photo = clonedDoc.querySelector('.postcard-photo');

  if (photo) {
    photo.style.boxShadow = 'none';
    photo.style.filter = 'none';
    photo.style.mixBlendMode = 'normal';
    photo.style.isolation = 'auto';
    photo.style.opacity = '1';

    const img = photo.querySelector('.postcard-photo__image');

    if (img) {
      img.style.filter = 'none';
      img.style.mixBlendMode = 'normal';
      img.style.opacity = '1';
      img.style.imageRendering = 'auto';
    }
  }

  if (!clonedDoc.getElementById(POSTCARD_CAPTURE_STYLE_ID)) {
    const style = clonedDoc.createElement('style');
    style.id = POSTCARD_CAPTURE_STYLE_ID;
    style.textContent = `
      .postcard-photo::before,
      .postcard-photo::after {
        display: none !important;
        content: none !important;
      }
      .postcard-photo {
        box-shadow: none !important;
        filter: none !important;
        mix-blend-mode: normal !important;
      }
    `;
    clonedDoc.head.appendChild(style);
  }
}

function getPostcardImageSrc(postcard) {
  if (!postcard?.image?.base64) {
    return null;
  }

  const mimeType = postcard.image.mimeType || 'image/png';
  return `data:${mimeType};base64,${postcard.image.base64}`;
}

async function waitForPostcardImageReady(container) {
  const img = container?.querySelector('.postcard-photo__image');

  if (!img) {
    return;
  }

  if (img.complete && img.naturalWidth > 0) {
    return;
  }

  await new Promise((resolve, reject) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', () => reject(new Error('Postcard image failed to load.')), {
      once: true,
    });
  });
}

function preparePostcardCardCloneForCapture(clonedDoc, clonedElement, isFlipped) {
  preparePostcardCloneForCapture(clonedDoc);

  const scene =
    clonedElement?.classList?.contains('postcard-flip-scene')
      ? clonedElement
      : clonedDoc.querySelector('.postcard-flip-scene');

  if (!scene) {
    return;
  }

  scene.style.cursor = 'default';
  scene.style.transform = 'none';

  const card = scene.querySelector('.postcard-flip-card');
  const front = scene.querySelector('.postcard-flip-face--front');
  const back = scene.querySelector('.postcard-flip-face--back');

  if (card) {
    card.style.transform = 'none';
    card.style.transformStyle = 'flat';
  }

  if (isFlipped) {
    if (front) {
      front.style.display = 'none';
    }

    if (back) {
      back.style.transform = 'none';
      back.style.position = 'relative';
      back.style.inset = 'auto';
      back.style.width = '100%';
      back.style.height = '100%';
    }
  } else if (back) {
    back.style.display = 'none';

    if (front) {
      front.style.transform = 'none';
      front.style.position = 'relative';
      front.style.inset = 'auto';
      front.style.width = '100%';
      front.style.height = '100%';
    }
  }

  if (!clonedDoc.getElementById(`${POSTCARD_CAPTURE_STYLE_ID}-card`)) {
    const style = clonedDoc.createElement('style');
    style.id = `${POSTCARD_CAPTURE_STYLE_ID}-card`;
    style.textContent = `
      .postcard-flip-scene,
      .postcard-flip-card,
      .postcard-flip-face {
        transform: none !important;
        transform-style: flat !important;
        perspective: none !important;
      }
      .postcard-back__image {
        filter: blur(8px) brightness(0.35) !important;
      }
      .postcard-back--paper {
        background: #efe4d0 !important;
      }
    `;
    clonedDoc.head.appendChild(style);
  }
}

async function waitForPostcardCardReady(container) {
  const images = container?.querySelectorAll('img') || [];

  await Promise.all(
    [...images].map(
      (img) =>
        new Promise((resolve, reject) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }

          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', () => reject(new Error('Postcard image failed to load.')), {
            once: true,
          });
        })
    )
  );
}

function buildPostcardDownloadFilename(city) {
  const slug =
    String(city || 'postcard')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'postcard';

  return `postcard-${slug}-${Date.now()}.png`;
}

function downloadPostcardPng(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function capturePostcardElement(element) {
  const scale = window.devicePixelRatio * 2;

  return html2canvas(element, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale,
    logging: false,
    imageTimeout: 15000,
    onclone: (clonedDoc) => {
      preparePostcardCloneForCapture(clonedDoc);
    },
  });
}

function capturePostcardCardElement(element, isFlipped = false) {
  const scale = window.devicePixelRatio * 2;

  return html2canvas(element, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: null,
    scale,
    logging: false,
    imageTimeout: 15000,
    onclone: (clonedDoc, clonedElement) => {
      preparePostcardCardCloneForCapture(clonedDoc, clonedElement, isFlipped);
    },
  });
}

function pickVisualColors(atmosphere) {
  const searchableText = [
    atmosphere?.currentMood,
    ...(atmosphere?.visualPalette || []),
    ...(atmosphere?.sensoryDetails || []),
    ...(atmosphere?.travelMoments || []),
  ]
    .join(' ')
    .toLowerCase();

  const matches = COLOR_LEXICON.filter(({ keywords }) =>
    keywords.some((keyword) => searchableText.includes(keyword))
  ).map(({ color }) => color);
  const uniqueMatches = [...new Set(matches)];

  return [...uniqueMatches, ...FALLBACK_COLORS].slice(0, 4);
}

function formatShortDate(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatDate(value) {
  if (!value) {
    return 'Just now';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function App() {
  const [step, setStep] = useState(0);
  const [stepVisible, setStepVisible] = useState(true);

  const [city, setCity] = useState('');
  const [countryName, setCountryName] = useState('');
  const [geoResolvedCity, setGeoResolvedCity] = useState('');
  const [detectedLocationLabel, setDetectedLocationLabel] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');

  const [selectedPreferences, setSelectedPreferences] = useState([]);
  const [captionMode, setCaptionMode] = useState('auto');
  const [pendingCaption, setPendingCaption] = useState('');

  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [lastPostcardId, setLastPostcardId] = useState(() => readLastPostcardId());
  const [selectedPostcard, setSelectedPostcard] = useState(null);
  const [draftCaption, setDraftCaption] = useState('');
  const [autoCaption, setAutoCaption] = useState('');
  const [autoCaptionLoading, setAutoCaptionLoading] = useState(false);
  const [autoCaptionError, setAutoCaptionError] = useState('');

  const [sendEmailExpanded, setSendEmailExpanded] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sendEmailStatus, setSendEmailStatus] = useState('idle');
  const [sendEmailMessage, setSendEmailMessage] = useState('');
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [selectedHistoryCity, setSelectedHistoryCity] = useState(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const postcardCaptureRef = useRef(null);
  const generationRunRef = useRef(false);
  const deepLinkHandledRef = useRef(false);

  const selectedPostcardId = getPostcardId(selectedPostcard);
  const resolvedCity = (geoResolvedCity || city).trim();
  const historyByCountry = useMemo(
    () => groupPostcardsByCountryAndCity(historyItems, normalizeCityName),
    [historyItems]
  );
  const selectedCityItems = useMemo(
    () => historyItems
      .filter((postcard) =>
        resolveCanonicalCityName(postcard, normalizeCityName) === selectedHistoryCity
      )
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    [historyItems, selectedHistoryCity]
  );
  const selectedCityStamp = selectedCityItems.find((postcard) => postcard.aiStamp)?.aiStamp;

  const favoritedPostcards = useMemo(
    () =>
      [...historyItems]
        .filter((postcard) => postcard.isFavorited)
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)),
    [historyItems]
  );

  const visualColors = useMemo(
    () => pickVisualColors(selectedPostcard?.atmosphere),
    [selectedPostcard]
  );
  const postcardVisualStyle = useMemo(
    () => ({
      '--photo-gradient': `linear-gradient(135deg, ${visualColors[0]} 0%, ${visualColors[1]} 30%, ${visualColors[2]} 68%, ${visualColors[3]} 100%)`,
    }),
    [visualColors]
  );

  const displayCaption = useMemo(() => {
    if (!selectedPostcard) {
      return '';
    }

    if (captionMode === 'auto') {
      return autoCaption.trim();
    }

    return draftCaption.trim();
  }, [captionMode, autoCaption, draftCaption, selectedPostcard]);

  const showCaptionOverlay = Boolean(displayCaption);
  const postcardImageSrc = useMemo(
    () => getPostcardImageSrc(selectedPostcard),
    [selectedPostcard]
  );

  const detailCategory = useMemo(
    () =>
      preferenceToCategory(
        selectedPreferences,
        selectedPostcard?.atmosphere?.preferences
      ),
    [selectedPreferences, selectedPostcard]
  );
  const selectedCityPostcardCount = useMemo(() => {
    if (!selectedPostcard?.city) {
      return 0;
    }

    return countPostcardsForCity(historyItems, selectedPostcard.city, normalizeCityName);
  }, [historyItems, selectedPostcard]);
  const selectedPostcardCategory = useMemo(() => {
    const preference = selectedPostcard?.atmosphere?.preferences?.[0];

    if (!preference) {
      return detailCategory || 'landmarks';
    }

    const labelMap = {
      Landmarks: 'landmarks',
      Food: 'food',
      'Quiet Moments': 'quiet',
      Nightlife: 'nightlife',
      Nature: 'nature',
    };

    return labelMap[preference] || detailCategory || 'landmarks';
  }, [selectedPostcard, detailCategory]);
  const selectedCollectedNumber = useMemo(() => {
    if (!selectedPostcard?.city) {
      return 1;
    }

    const targetCity = resolveCanonicalCityName(selectedPostcard, normalizeCityName);
    const cityPostcards = historyItems
      .filter(
        (item) =>
          resolveCanonicalCityName(item, normalizeCityName) === targetCity && !item.isFavorited
      )
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt));

    const index = cityPostcards.findIndex(
      (item) => getPostcardId(item) === getPostcardId(selectedPostcard)
    );

    return index >= 0 ? index + 1 : cityPostcards.length || 1;
  }, [historyItems, selectedPostcard]);

  const goToStep = useCallback((nextStep) => {
    if (nextStep !== 5) {
      syncShareUrl('');
    }
    setStepVisible(false);
    window.setTimeout(() => {
      setStep(nextStep);
      setStepVisible(true);
    }, STEP_TRANSITION_MS);
  }, []);

  function applyPostcardSelection(
    postcard,
    { caption = null, mode = 'auto', updateShareUrl = true } = {}
  ) {
    const postcardId = getPostcardId(postcard);
    const storedCaption = readCaptionOverride(postcardId);
    const initialCaption = caption ?? storedCaption ?? '';

    setSelectedPostcard(postcard);
    setCaptionMode(mode);
    setDraftCaption(mode === 'write' ? initialCaption : '');
    setAutoCaption(mode === 'auto' ? (postcard?.caption ?? '') : '');
    setAutoCaptionError('');

    if (updateShareUrl) {
      syncShareUrl(postcardId);
    }
  }

  function closeHistoryOverlay() {
    setSelectedPostcard(null);
    syncShareUrl('');
  }

  function navigateToHistory() {
    closeHistoryOverlay();
    goToStep(6);
  }

  function navigateToHome() {
    closeHistoryOverlay();
    setErrorMessage('');
    goToStep(0);
  }

  async function navigateToPostcard(targetId) {
    closeHistoryOverlay();
    setErrorMessage('');

    if (!targetId) {
      goToStep(5);
      return;
    }

    const fromHistory = historyItems.find((item) => getPostcardId(item) === targetId);

    if (fromHistory) {
      applyPostcardSelection(fromHistory, { updateShareUrl: true });
      goToStep(5);
      return;
    }

    try {
      const postcard = await requestJson(`/api/postcards/${targetId}`);
      applyPostcardSelection(
        {
          ...postcard,
          _id: postcard.id || postcard._id,
        },
        { updateShareUrl: true }
      );
      goToStep(5);
    } catch (error) {
      setErrorMessage(error.message);
      goToStep(5);
    }
  }

  function handleHistoryBack() {
    const lastId = readLastPostcardId();

    if (lastId) {
      navigateToPostcard(lastId);
      return;
    }

    navigateToHome();
  }

  function handleToggleSendEmail() {
    setSendEmailExpanded((open) => !open);
    setSendEmailStatus('idle');
    setSendEmailMessage('');
  }

  async function loadArchive(selectFirstItem = false) {
    setHistoryLoading(true);

    try {
      const postcards = await requestJson('/api/postcards?limit=100');

      setHistoryItems(postcards);

      if (selectFirstItem && postcards.length > 0) {
        applyPostcardSelection(postcards[0]);
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function generatePostcardForCity(rawCity, options = {}) {
    const normalizedCity = (typeof rawCity === 'string' ? rawCity : '').trim();

    if (!normalizedCity) {
      const message = 'A city is required to create your postcard.';
      setErrorMessage(message);
      throw new Error(message);
    }

    const preferences =
      options.preferences ?? getPreferenceLabels(selectedPreferences);
    const requestBody = {
      city: normalizedCity,
      countryName: countryName.trim(),
      userId: getOrCreateUserId(),
      preferences,
    };

    if (options.regenerate) {
      requestBody.regenerate = true;
      requestBody.previousAnchorName = options.previousAnchorName || '';
    }

    setErrorMessage('');
    setIsGenerating(true);

    try {
      const postcard = await requestJson('/api/postcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const normalizedPostcard = {
        ...postcard,
        _id: postcard.id,
      };

      if (captionMode === 'write') {
        const captionText = pendingCaption.trim();
        applyPostcardSelection(normalizedPostcard, {
          mode: 'write',
          caption: captionText,
        });

        if (captionText) {
          writeCaptionOverride(getPostcardId(normalizedPostcard), captionText);
        }
      } else {
        applyPostcardSelection(normalizedPostcard, { mode: 'auto' });
      }

      const createdPostcardId = getPostcardId(normalizedPostcard);
      writeLastPostcardId(createdPostcardId);
      setLastPostcardId(createdPostcardId);

      await loadArchive(false);
      return normalizedPostcard;
    } catch (error) {
      setErrorMessage(error.message);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    if (deepLinkHandledRef.current) {
      return undefined;
    }

    let ignore = false;

    async function loadSharedPostcard() {
      const postcardId = new URLSearchParams(window.location.search).get('postcard');

      if (!postcardId) {
        return;
      }

      deepLinkHandledRef.current = true;

      try {
        const postcard = await requestJson(`/api/postcards/${postcardId}`);

        if (ignore) {
          return;
        }

        applyPostcardSelection(postcard);
        await loadArchive(false);
        setIsGenerating(false);
        setStep(5);
        setStepVisible(true);
      } catch {
        if (!ignore) {
          setIsGenerating(false);
          syncShareUrl('');
        }
      }
    }

    loadSharedPostcard();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 5) return;
    const timeout = window.setTimeout(() => {
      setIsGenerating(false);
    }, 30000);
    return () => window.clearTimeout(timeout);
  }, [step]);

  useEffect(() => {
    if (step !== 0) {
      return undefined;
    }

    function handleWheel(event) {
      if (event.deltaY > 12) {
        goToStep(1);
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => window.removeEventListener('wheel', handleWheel);
  }, [step, goToStep]);

  useEffect(() => {
    if (step !== 4) {
      generationRunRef.current = false;
      return undefined;
    }

    if (generationRunRef.current || isGenerating) {
      return undefined;
    }

    generationRunRef.current = true;
    let cancelled = false;

    async function createPostcard() {
      try {
        await generatePostcardForCity(resolvedCity);

        if (!cancelled) {
          goToStep(7);
        }
      } catch {
        if (!cancelled) {
          generationRunRef.current = false;
          goToStep(3);
        }
      }
    }

    createPostcard();

    return () => {
      cancelled = true;
    };
  }, [step]);

  useEffect(() => {
    if (step !== 6) {
      return undefined;
    }

    loadArchive(false);

    return undefined;
  }, [step]);

  useEffect(() => {
    if (!selectedPostcardId || captionMode !== 'write') {
      return undefined;
    }

    writeCaptionOverride(selectedPostcardId, draftCaption);
  }, [draftCaption, selectedPostcardId, captionMode]);

  useEffect(() => {
    if (!selectedPostcardId || captionMode !== 'auto' || !selectedPostcard) {
      return undefined;
    }

    if (!selectedPostcard.image?.base64) {
      setAutoCaption('');
      setAutoCaptionError('No photo yet — caption needs the generated image.');
      return undefined;
    }

    if (selectedPostcard.caption) {
      setAutoCaption(selectedPostcard.caption);
      setAutoCaptionError('');
      return undefined;
    }

    let cancelled = false;

    async function loadCaption() {
      setAutoCaptionLoading(true);
      setAutoCaptionError('');

      try {
        const data = await requestJson(`/api/postcards/${selectedPostcardId}/generate-caption`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        });

        if (!cancelled) {
          setAutoCaption(data.caption || '');
          setSelectedPostcard((current) =>
            current && getPostcardId(current) === selectedPostcardId
              ? { ...current, caption: data.caption || '' }
              : current
          );
        }
      } catch (error) {
        if (!cancelled) {
          setAutoCaptionError(error.message);
          setAutoCaption('');
        }
      } finally {
        if (!cancelled) {
          setAutoCaptionLoading(false);
        }
      }
    }

    loadCaption();

    return () => {
      cancelled = true;
    };
  }, [selectedPostcardId, captionMode, selectedPostcard]);

  useEffect(() => {
    if (!selectedPostcardId) {
      return;
    }

    setSendEmailExpanded(false);
    setRecipientEmail('');
    setSendEmailStatus('idle');
    setSendEmailMessage('');
  }, [selectedPostcardId]);

  function togglePreference(preferenceId) {
    setSelectedPreferences((current) =>
      current.includes(preferenceId) ? [] : [preferenceId]
    );
  }

  async function handleDetectLocation() {
    setLocationLoading(true);
    setLocationError('');
    setDetectedLocationLabel('');
    setErrorMessage('');

    try {
      const position = await getCurrentPositionAsync({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 300000,
      });
      const { latitude: lat, longitude: lon } = position.coords;
      const location = await fetchLocationFromCoordinates(lat, lon);
      const inputCity = pickAsciiAddressField(location.city);

      if (!inputCity) {
        throw new Error('NO_CITY');
      }

      setCity(inputCity);
      setCountryName(location.country || '');
      setDetectedLocationLabel(location.label || inputCity);
    } catch {
      setLocationError(LOCATION_UNAVAILABLE_MESSAGE);
    } finally {
      setLocationLoading(false);
    }
  }

  function handleManualLocationContinue(event) {
    event.preventDefault();
    const manualCity = city.trim();

    if (!manualCity) {
      setLocationError('Enter a city to continue.');
      return;
    }

    setGeoResolvedCity(manualCity);
    setLocationError('');
    goToStep(2);
  }

  function handleCityInputChange(value) {
    setCity(value);
    setDetectedLocationLabel('');
    if (locationError === LOCATION_UNAVAILABLE_MESSAGE) {
      setLocationError('');
    }
  }

  function handleCreatePostcard() {
    setErrorMessage('');
    goToStep(4);
  }

  function handleChangeVibe() {
    setIsGenerating(false);
    if (!resolvedCity && selectedPostcard?.city) {
      setCity(selectedPostcard.city);
      setGeoResolvedCity(selectedPostcard.city);
    }
    setSelectedPreferences([]);
    goToStep(2);
  }

  async function handleSameVibeNewSpot() {
    try {
      const cityToUse = (selectedPostcard?.city || resolvedCity || '').trim();

      if (!cityToUse) {
        setErrorMessage('A city is required to create your postcard.');
        return;
      }

      const preferences =
        selectedPostcard?.atmosphere?.preferences?.length > 0
          ? selectedPostcard.atmosphere.preferences
          : getPreferenceLabels(selectedPreferences);
      const previousAnchorName = selectedPostcard?.atmosphere?.anchorLocation?.location || '';

      await generatePostcardForCity(cityToUse, {
        regenerate: true,
        previousAnchorName,
        preferences,
      });
      goToStep(5);
    } catch {
      // generatePostcardForCity already surfaces the error message
    } finally {
      setIsGenerating(false);
    }
  }

  function confirmDelete(postcardId) {
    setPendingDeleteId(postcardId);
  }

  async function handleDeletePostcard(postcardId) {
    const previousItems = historyItems;
    const wasSelected = selectedPostcardId === postcardId;

    setPendingDeleteId(null);
    setHistoryItems((current) => current.filter((item) => getPostcardId(item) !== postcardId));

    if (wasSelected) {
      setSelectedPostcard(null);
      syncShareUrl('');
    }

    if (lastPostcardId === postcardId) {
      clearLastPostcardId();
      setLastPostcardId(null);
    }

    try {
      await requestJson(`/api/postcards/${postcardId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      setHistoryItems(previousItems);
      setErrorMessage(error.message);
    }
  }

  async function toggleFavorite(postcard) {
    const postcardId = getPostcardId(postcard);
    const nextFavorited = !postcard.isFavorited;
    const previousItems = historyItems;
    const previousSelected = selectedPostcard;

    setHistoryItems((current) =>
      current.map((item) =>
        getPostcardId(item) === postcardId ? { ...item, isFavorited: nextFavorited } : item
      )
    );

    if (selectedPostcardId === postcardId) {
      setSelectedPostcard((current) =>
        current ? { ...current, isFavorited: nextFavorited } : current
      );
    }

    try {
      await requestJson(`/api/postcards/${postcardId}/favorite`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isFavorited: nextFavorited }),
      });
    } catch (error) {
      setHistoryItems(previousItems);
      setSelectedPostcard(previousSelected);
      setErrorMessage(error.message);
    }
  }

  function handleHistoryCitySelect(cityGroup) {
    setSelectedHistoryCity(cityGroup.cityName);
  }

  function handleHistoryCityBack() {
    setSelectedHistoryCity(null);
  }

  function handleViewCollectionFromMemory() {
    if (selectedPostcard) {
      setSelectedHistoryCity(
        findCityGroupForPostcard(historyByCountry, selectedPostcard, normalizeCityName)?.cityName || null
      );
    } else {
      setSelectedHistoryCity(null);
    }

    goToStep(6);
  }

  function handleViewPostcardFromSuccess() {
    goToStep(5);
  }

  function handleHistorySelect(postcard) {
    const postcardId = getPostcardId(postcard);
    const storedCaption = readCaptionOverride(postcardId);
    const hasStoredWrite = storedCaption !== null;

    applyPostcardSelection(postcard, {
      mode: hasStoredWrite ? 'write' : 'auto',
      caption: hasStoredWrite ? storedCaption : undefined,
      updateShareUrl: false,
    });
  }

  async function resolvePostcardImageDataUrl() {
    if (postcardCaptureRef.current) {
      await waitForPostcardImageReady(postcardCaptureRef.current);
      const canvas = await capturePostcardElement(postcardCaptureRef.current);

      return canvas.toDataURL('image/png');
    }

    if (selectedPostcard?.image?.base64 && selectedPostcard?.image?.mimeType) {
      return `data:${selectedPostcard.image.mimeType};base64,${selectedPostcard.image.base64}`;
    }

    return '';
  }

  async function handleDownloadPostcard(cardElement, isFlipped) {
    if (!cardElement || !selectedPostcard) {
      return;
    }

    setDownloadLoading(true);
    setErrorMessage('');

    try {
      await waitForPostcardCardReady(cardElement);
      const canvas = await capturePostcardCardElement(cardElement, isFlipped);
      const dataUrl = canvas.toDataURL('image/png');
      downloadPostcardPng(dataUrl, buildPostcardDownloadFilename(selectedPostcard.city));
    } catch (error) {
      setErrorMessage(error.message || 'Failed to download postcard.');
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleSendPostcardEmail(event) {
    event.preventDefault();

    if (!selectedPostcard) {
      return;
    }

    const trimmed = recipientEmail.trim();

    if (!trimmed) {
      setSendEmailMessage('Enter a recipient email address.');
      setSendEmailStatus('error');
      return;
    }

    const simpleCheck = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!simpleCheck.test(trimmed)) {
      setSendEmailMessage('Please enter a valid email address.');
      setSendEmailStatus('error');
      return;
    }

    setSendEmailStatus('sending');
    setSendEmailMessage('');

    try {
      const postcardImageBase64 = await resolvePostcardImageDataUrl();

      if (!postcardImageBase64) {
        throw new Error('No postcard image is available to send yet.');
      }

      await requestJson('/api/send-postcard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: trimmed,
          postcardImageBase64,
          caption: displayCaption,
          city: selectedPostcard.city,
        }),
      });

      setSendEmailStatus('success');
      setSendEmailMessage('Email sent.');
    } catch (error) {
      setSendEmailStatus('error');
      setSendEmailMessage(error.message || 'Failed to send email.');
    }
  }

  const stepClassName = `guided-step ${stepVisible ? 'guided-step--visible' : 'guided-step--fading'}`;
  const historyBackPostcardId = readLastPostcardId();
  const historyBackLabel = historyBackPostcardId ? 'Back to postcard' : 'Create a postcard';

  return (
    <div className="guided-app">
      <div className="guided-app__grain" aria-hidden="true" />

      {step === 0 ? (
        <section className={stepClassName}>
          <button
            type="button"
            className="button button--ghost guided-landing-history"
            onClick={navigateToHistory}
          >
            View History
          </button>
          <div className="guided-step__inner">
            <p className="guided-hero-line">Every city has a version that&apos;s yours.</p>
            <button type="button" className="button button--ghost" onClick={() => goToStep(1)}>
              Continue
            </button>
            <p className="guided-scroll-hint">Scroll to continue</p>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className={stepClassName}>
          <div className="guided-step__inner">
            <p className="guided-title">Where are you?</p>
            <p className="guided-subline">Detect your location or type a city to begin.</p>
            <form className="guided-field" onSubmit={handleManualLocationContinue}>
              <span>City</span>
              <div className="guided-city-input-row">
                <input
                  type="text"
                  value={city}
                  onChange={(event) => handleCityInputChange(event.target.value)}
                  placeholder="Tokyo, Lisbon, Seattle..."
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="button button--ghost button--icon guided-location-button"
                  aria-label="Detect location"
                  disabled={locationLoading}
                  onClick={handleDetectLocation}
                >
                  📍
                </button>
              </div>

              {locationLoading ? (
                <p className="guided-location-status" aria-live="polite">
                  Detecting location...
                </p>
              ) : null}

              {detectedLocationLabel && !locationLoading ? (
                <p className="guided-location-pill" aria-live="polite">
                  📍 {detectedLocationLabel}
                </p>
              ) : null}

              {locationError ? (
                <p className="guided-location-error" aria-live="polite">
                  {locationError}
                </p>
              ) : null}

              <button className="button button--primary" type="submit" disabled={locationLoading}>
                Continue
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={stepClassName}>
          <div className="guided-step__inner">
            <p className="guided-title">What draws you in?</p>
            <p className="guided-subline">Choose one. We will shape the mood around it.</p>
            <div className="guided-card-grid">
              {PREFERENCE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`guided-select-card ${
                    selectedPreferences.includes(option.id) ? 'guided-select-card--active' : ''
                  }`}
                  aria-pressed={selectedPreferences.includes(option.id)}
                  onClick={() => togglePreference(option.id)}
                >
                  <span className="guided-select-card__label">{option.label}</span>
                </button>
              ))}
            </div>
            {selectedPreferences.length > 0 ? (
              <button type="button" className="button button--primary" onClick={() => goToStep(3)}>
                Continue
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={stepClassName}>
          <div className="guided-step__inner">
            <p className="guided-title">How should the caption feel?</p>
            <div className="guided-card-grid guided-card-grid--two">
              <button
                type="button"
                className={`guided-select-card ${
                  captionMode === 'write' ? 'guided-select-card--active' : ''
                }`}
                aria-pressed={captionMode === 'write'}
                onClick={() => setCaptionMode('write')}
              >
                <span className="guided-select-card__label">I&apos;ll write it myself</span>
              </button>
              <button
                type="button"
                className={`guided-select-card ${
                  captionMode === 'auto' ? 'guided-select-card--active' : ''
                }`}
                aria-pressed={captionMode === 'auto'}
                onClick={() => setCaptionMode('auto')}
              >
                <span className="guided-select-card__label">Generate for me</span>
              </button>
            </div>

            {captionMode === 'write' ? (
              <div className="guided-caption-field">
                <textarea
                  className="guided-caption-input"
                  value={pendingCaption}
                  maxLength={CAPTION_MAX_LENGTH}
                  onChange={(event) => setPendingCaption(event.target.value)}
                  placeholder="A line for the back of the card..."
                />
                <p className="guided-caption-counter" aria-live="polite">
                  {pendingCaption.length}/{CAPTION_MAX_LENGTH}
                </p>
              </div>
            ) : null}

            {errorMessage ? <p className="callout callout--error">{errorMessage}</p> : null}

            <button
              type="button"
              className="button button--primary"
              disabled={!resolvedCity}
              onClick={handleCreatePostcard}
            >
              Create my postcard
            </button>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className={stepClassName}>
          <div className="guided-step__inner">
            <p className="guided-loading guided-loading--pulse" aria-live="polite">
              Creating your postcard...
            </p>
          </div>
        </section>
      ) : null}

      {step === 7 ? (
        <section className={stepClassName}>
          <div className="guided-step__inner postcard-ready">
            <p className="guided-title">Your postcard is ready</p>
            <p className="postcard-ready__city">{selectedPostcard?.city}</p>
            <div className="postcard-ready__stamp-row">
              <p className="postcard-ready__subtitle">AI Stamp collected</p>
              <AiCityStamp
                aiStamp={selectedPostcard?.aiStamp}
                cityName={selectedPostcard?.city}
                category={selectedPostcardCategory}
                size="sm"
              />
            </div>
            <p className="postcard-ready__count">
              {selectedCityPostcardCount} postcard{selectedCityPostcardCount === 1 ? '' : 's'}{' '}
              collected
            </p>
            <div className="guided-actions postcard-ready__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={handleViewPostcardFromSuccess}
              >
                View postcard
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={handleViewCollectionFromMemory}
              >
                View collection
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className={stepClassName}>
          <div className="guided-step__inner guided-postcard-layout">
            {selectedPostcard ? (
              <PostcardDetailLayout
                postcard={selectedPostcard}
                captureRef={postcardCaptureRef}
                visualStyle={postcardVisualStyle}
                imageSrc={postcardImageSrc}
                displayCaption={displayCaption}
                showCaptionOverlay={showCaptionOverlay}
                autoCaptionLoading={autoCaptionLoading}
                captionMode={captionMode}
                autoCaptionError={autoCaptionError}
                sendEmailExpanded={sendEmailExpanded}
                onToggleSendEmail={handleToggleSendEmail}
                onDownloadPostcard={handleDownloadPostcard}
                downloadLoading={downloadLoading}
                recipientEmail={recipientEmail}
                onRecipientEmailChange={setRecipientEmail}
                onSendEmail={handleSendPostcardEmail}
                sendEmailStatus={sendEmailStatus}
                sendEmailMessage={sendEmailMessage}
                showCreationActions
                onChangeVibe={handleChangeVibe}
                onSameVibeNewSpot={handleSameVibeNewSpot}
                onViewHistory={navigateToHistory}
                onClose={navigateToHistory}
                onBackHome={navigateToHome}
                isGenerating={isGenerating}
                detailCategory={detailCategory}
                collectedNumber={selectedCollectedNumber}
              />
            ) : (
              <p className="guided-muted">Your postcard is not ready yet.</p>
            )}
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className={stepClassName}>
          <div className="guided-history">
            <div className="guided-history__header">
              <p className="guided-title">
                {selectedHistoryCity || 'Your postcard history'}
              </p>
              <button
                type="button"
                className="button button--ghost"
                onClick={selectedHistoryCity ? handleHistoryCityBack : handleHistoryBack}
              >
                {selectedHistoryCity ? 'Back to collection' : historyBackLabel}
              </button>
              <button type="button" className="button button--ghost" onClick={navigateToHome}>
                Back to home
              </button>
            </div>

            {errorMessage ? <p className="callout callout--error">{errorMessage}</p> : null}

            {historyLoading ? (
              <p className="guided-muted">Loading postcards from memory...</p>
            ) : selectedHistoryCity ? (
              <div className="history-city-detail">
                <div className="history-city-detail__header">
                  <h2 className="history-city-detail__title">{selectedHistoryCity}</h2>
                  <AiCityStamp
                    aiStamp={selectedCityStamp}
                    cityName={selectedHistoryCity}
                    category={preferenceToCategory([], selectedCityItems[0]?.atmosphere?.preferences || []) || 'landmarks'}
                    size="sm"
                  />
                </div>
                <p className="history-city-detail__meta">
                  {selectedCityItems.length} postcard
                  {selectedCityItems.length === 1 ? '' : 's'} in this city
                </p>
                <div className="guided-history-grid">
                  {selectedCityItems.map((postcard) => (
                    <HistoryPostcardCard
                      key={getPostcardId(postcard)}
                      postcard={postcard}
                      pendingDeleteId={pendingDeleteId}
                      onSelect={handleHistorySelect}
                      onToggleFavorite={toggleFavorite}
                      onConfirmDelete={confirmDelete}
                      onDelete={handleDeletePostcard}
                      onCancelDelete={() => setPendingDeleteId(null)}
                    />
                  ))}
                </div>
              </div>
            ) : historyItems.length > 0 ? (
              <div className="guided-history-groups">
                {favoritedPostcards.length > 0 ? (
                  <section className="history-favorites-group">
                    <div className="history-favorites-group__header">
                      <span className="history-favorites-group__name">
                        <span className="history-favorites-group__heart" aria-hidden="true">
                          ♥
                        </span>{' '}
                        Favorites
                      </span>
                      <span className="history-favorites-group__line" aria-hidden="true" />
                    </div>
                    <div className="guided-history-grid">
                      {favoritedPostcards.map((postcard) => (
                        <HistoryPostcardCard
                          key={`favorite-${getPostcardId(postcard)}`}
                          postcard={postcard}
                          pendingDeleteId={pendingDeleteId}
                          onSelect={handleHistorySelect}
                          onToggleFavorite={toggleFavorite}
                          onConfirmDelete={confirmDelete}
                          onDelete={handleDeletePostcard}
                          onCancelDelete={() => setPendingDeleteId(null)}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {historyByCountry.map((countryGroup) => (
                  <section key={countryGroup.countryName} className="history-country-group">
                    <div className="history-country-group__header">
                      <span className="history-country-group__name">
                        {countryGroup.countryName} {getCountryFlag(countryGroup.countryName)}
                      </span>
                      <span className="history-country-group__line" aria-hidden="true" />
                    </div>
                    <div className="history-city-card-grid">
                      {countryGroup.cities.map((cityGroup) => (
                        <HistoryCityCard
                          key={`${countryGroup.countryName}-${cityGroup.cityName}`}
                          cityGroup={cityGroup}
                          onSelect={handleHistoryCitySelect}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="guided-muted">No postcards saved yet. Create your first one to begin.</p>
            )}
          </div>

          {selectedPostcard ? (
            <PostcardOverlay onClose={closeHistoryOverlay}>
              <PostcardDetailLayout
                postcard={selectedPostcard}
                captureRef={postcardCaptureRef}
                visualStyle={postcardVisualStyle}
                imageSrc={postcardImageSrc}
                displayCaption={displayCaption}
                showCaptionOverlay={showCaptionOverlay}
                autoCaptionLoading={autoCaptionLoading}
                captionMode={captionMode}
                autoCaptionError={autoCaptionError}
                sendEmailExpanded={sendEmailExpanded}
                onToggleSendEmail={handleToggleSendEmail}
                onDownloadPostcard={handleDownloadPostcard}
                downloadLoading={downloadLoading}
                recipientEmail={recipientEmail}
                onRecipientEmailChange={setRecipientEmail}
                onSendEmail={handleSendPostcardEmail}
                sendEmailStatus={sendEmailStatus}
                sendEmailMessage={sendEmailMessage}
                showCreationActions={false}
                onChangeVibe={handleChangeVibe}
                onSameVibeNewSpot={handleSameVibeNewSpot}
                onViewHistory={() => goToStep(6)}
                onClose={closeHistoryOverlay}
                onBackHome={navigateToHome}
                isGenerating={isGenerating}
                detailCategory={detailCategory}
                collectedNumber={selectedCollectedNumber}
              />
            </PostcardOverlay>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export default App;
