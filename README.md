# PostCard Agent

PostCard Agent turns a city and a selected travel mood into an AI-generated digital postcard. It combines city imagery, captions, and place details with a saved collection that you can revisit, organize, download, or email. Recent postcard history helps inform subsequent generations.

## Key features

- Enter a city or detect your location through browser geolocation and reverse geocoding.
- Choose Landmarks, Food, Quiet Moments, Nightlife, or Nature to guide generation.
- Generate imagery and city atmosphere around a selected place; request another spot with the same mood or change the mood.
- Use an AI caption or write your own; flip the postcard to explore place details.
- Browse saved postcards by country and city, view AI city stamps, mark favorites, and delete postcards.
- Download postcards as PNGs, email them when configured, and open individual postcards through a `?postcard=...` URL.

## Tech stack

- **Frontend:** React 19, Vite 8, CSS, and html2canvas for PNG export.
- **Backend:** Node.js, Express 5, dotenv, and Resend for email delivery.
- **Database:** MongoDB using the official Node.js driver.
- **AI:** Gemini through the Google Generative AI SDK for text and image-aware captions; Gemini image generation through Vertex AI and the Google Gen AI SDK.
- **Location:** Browser Geolocation API and OpenStreetMap Nominatim reverse geocoding.

## Architecture

The React frontend calls the Express JSON API and sends a browser-generated user ID stored in localStorage to scope collections. The backend reads recent postcards from MongoDB, uses Gemini to select a place and generate atmosphere, captions, details, and city stamps, and calls Vertex AI for postcard images. Postcards and city records are saved in MongoDB and returned to the frontend; email delivery goes through Resend. The browser ID is collection identification, not an account login.

## Getting started

### Prerequisites

- Node.js 24 and npm, plus Git. Local verification used Node.js v24.14.0; Docker uses the same major (24).
- A MongoDB deployment reachable from your machine.
- A Gemini API key and a Google Cloud project with Vertex AI enabled, access to an image-capable Gemini model, and Google Cloud CLI for local authentication.
- A Resend account if you want to use email delivery.

### Clone and install

```bash
git clone https://github.com/evetlovelp99/postcard-agent.git
cd postcard-agent
npm install
npm --prefix client install
cp .env.example .env
cp client/.env.example client/.env.development
```

### Configure environment

In the root `.env`, fill in `MONGODB_URI`, `MONGODB_DB_NAME`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, and `VERTEX_IMAGE_MODEL`. Set `PORT` if needed; the backend defaults to port 3000. Add `RESEND_API_KEY` to enable email delivery; the current implementation uses Resend's test sender, so recipient restrictions apply. `MONGODB_TLS` defaults to enabled; set it to `false` only for local MongoDB without TLS.

Authenticate Vertex AI locally:

```bash
gcloud auth application-default login
```

Alternatively, configure `GOOGLE_APPLICATION_CREDENTIALS` for a service account credential file. Text generation uses `GEMINI_API_KEY` separately from Vertex AI authentication.

In `client/.env.development`, configure `VITE_API_BASE_URL` for the local backend. For production, copy the client example to `client/.env.production` and configure the same variable for the deployed backend. Vite selects the development file for `npm run dev` and the production file for `npm run build`; `client/.env` is unnecessary when these files supply the setting. Keep credentials and environment files out of Git.

### Run locally

Start the backend from the project root:

```bash
npm run dev
```

In a second terminal, start the frontend:

```bash
cd client
npm run dev
```

Open the URL printed by Vite. The backend defaults to `http://localhost:3000`; its health endpoint is `/api/health`. To build the frontend, run `npm run build` inside `client/`.

## Docker

Install Docker with Compose 2.24.0 or newer (required for optional `env_file`). The multi-stage Dockerfile checks backend JavaScript syntax, installs runtime dependencies with `npm ci --omit=dev`, and runs as the non-root `node` user. It copies only the package manifests and `src`; environment files and credentials are excluded from the build context and image.

Start the API and MongoDB 7 from the project root:

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:3000/api/health
curl http://localhost:3000/api/postcards
docker compose down
```

No `.env` is required to start. Without model keys, health and database-backed collection operations work; a fresh `GET /api/postcards` returns `{"success":true,"data":[]}`. Postcard generation, AI captions, and detail panels require Gemini configuration. Images additionally require Vertex configuration and credentials; email requires `RESEND_API_KEY`. The React frontend is run separately with the local instructions above.

An optional root `.env` supplies API keys and model configuration at runtime. Compose explicitly overrides its MongoDB settings with `MONGODB_URI=mongodb://mongo:27017/postcard` and `MONGODB_TLS=false`, so a local `.env` pointing to a cloud database cannot redirect this stack. MongoDB has no published host port, and the API binds to localhost. Set `APP_PORT=3001` when starting Compose if port 3000 is busy.

MongoDB data persists in the named `mongo-data` volume across `docker compose down`. To remove the stack **and its local database data**:

```bash
docker compose down -v
```

### Optional Vertex credential mount

There is no credential mount by default. To use a service account, keep its JSON file outside the repository, ensure UID 1000 can read it, and create a local `compose.vertex.yml` override:

```yaml
services:
  app:
    environment:
      GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/vertex.json
    volumes:
      - type: bind
        source: ${VERTEX_CREDENTIALS_FILE:?Set the absolute credential file path}
        target: /run/secrets/vertex.json
        read_only: true
        bind:
          create_host_path: false
```

Set `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, `VERTEX_IMAGE_MODEL`, and `GEMINI_API_KEY` in `.env`, then run:

```bash
VERTEX_CREDENTIALS_FILE=/absolute/path/to/service-account.json \
  docker compose -f docker-compose.yml -f compose.vertex.yml up -d --build
docker compose -f docker-compose.yml -f compose.vertex.yml down
```

The container credential path must match the mount target, rather than a host-side `GOOGLE_APPLICATION_CREDENTIALS` path. The file is mounted read-only at runtime and is never copied into the image.

## Testing

From the project root:

```bash
npm ci
npm test
```

Jest and supertest exercise the Express backend against an isolated in-memory MongoDB 7.0.41 process, including real indexes, matching the major version of the `mongo:7` Compose service. The binary version is pinned with `MONGOMS_VERSION` in `tests/environment.cjs`. Model SDKs and Resend are mocked; test environment variables replace local configuration, and non-local network access is blocked after MongoDB setup. No real model keys, email credentials, or external database are used. The first run may download a MongoDB binary into `node_modules/.cache/mongodb-binaries`; subsequent runs reuse it. Tests cover image and caption fallbacks, city stamp reuse and uniqueness, per-user recent memory, and malformed or incomplete atmosphere responses.

CI runs on push and pull_request: it sets up Node.js 24, caches npm dependencies and MongoDB 7.0.41 binaries outside `node_modules`, installs backend dependencies, checks every backend JavaScript file, runs backend tests, installs frontend dependencies, builds the frontend, and builds the runtime Docker image.

## Known issues

- A city stamp is created before atmosphere parsing. If parsing fails, the request returns 500 and saves no postcard, but the city stamp remains in MongoDB.
- Atmosphere JSON is parsed without required-field schema validation; incomplete responses can be accepted and saved. Tests document this existing behavior.
- The dependency audit has existing production vulnerabilities. At Step 2 verification, `npm audit --omit=dev` reported 10 (1 critical, 5 high, 3 moderate, 1 low), unchanged from the preceding lockfile; the full audit reported 29, including 19 additional moderate findings from the test dependency tree. No `npm audit fix` was run.

## Project structure

```text
postcard-agent/
├── client/
│   ├── public/             # Static assets
│   ├── src/
│   │   ├── components/     # Postcard details and city stamps
│   │   ├── utils/          # Collection grouping helpers
│   │   └── App.jsx         # Guided creation flow and history
│   └── .env.example        # Frontend environment setup
├── src/
│   ├── config/             # MongoDB connection and indexes
│   ├── controllers/        # Postcards and reverse geocoding
│   ├── routes/             # Express API routes
│   ├── services/           # Gemini, images, cities, and email
│   ├── middleware/         # Error handling
│   ├── utils/              # User ID helpers
│   ├── app.js              # Express application
│   └── server.js           # Server entry point
├── tests/                  # Mocked SDK tests with isolated MongoDB
├── jest.config.cjs         # Backend test configuration
├── Dockerfile              # Node 24 production API image
├── docker-compose.yml      # API and local MongoDB
├── .dockerignore           # Exclude development files and credentials
├── .env.example            # Backend environment setup
└── package.json            # Backend dependencies and commands
```
