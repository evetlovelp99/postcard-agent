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

- Node.js 22.12+ and npm, plus Git.
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

In the root `.env`, fill in `MONGODB_URI`, `MONGODB_DB_NAME`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `VERTEX_PROJECT_ID`, `VERTEX_LOCATION`, and `VERTEX_IMAGE_MODEL`. Set `PORT` if needed; the backend defaults to port 3000. Add `GEMINI_API_KEY` manually: the current root example does not include it. Add `RESEND_API_KEY` to enable email delivery; the current implementation uses Resend's test sender, so recipient restrictions apply.

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
├── .env.example            # Backend environment setup
└── package.json            # Backend dependencies and commands
```
