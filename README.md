# PostCard Agent Backend

Express backend for the PostCard Agent PRD flow:

- receive a city name from the frontend
- call Gemini through Vertex AI
- store the result in MongoDB
- return JSON to the frontend

## Environment variables

Copy the values into `.env`:

```bash
PORT=3000
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB_NAME=postcard
VERTEX_PROJECT_ID=your_gcp_project_id
GEMINI_MODEL=gemini-2.0-flash
```

Authentication uses Google Cloud Application Default Credentials instead of `GEMINI_API_KEY`.
The backend uses the fixed Vertex AI region `us-central1`.

For local development, authenticate with ADC before starting the server:

```bash
gcloud auth application-default login
```

Or point to a service account file:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## Run locally

```bash
npm install
npm run dev
```

## API

### `POST /api/postcards`

Request body:

```json
{
  "city": "Tokyo",
  "travelerId": "demo-user"
}
```

Response shape:

```json
{
  "success": true,
  "data": {
    "id": "6821...",
    "travelerId": "demo-user",
    "city": "Tokyo",
    "atmosphere": {
      "city": "Tokyo",
      "currentMood": "Rainy neon calm",
      "visualPalette": ["amber", "wet asphalt", "soft pink"],
      "sensoryDetails": ["ramen steam", "umbrellas brushing", "jazz from a doorway"],
      "bestMoment": "11pm after light rain",
      "travelMoments": [
        "a lantern-lit alley after dinner rush",
        "a quiet convenience store window glowing in drizzle",
        "a side-street cafe with empty stools"
      ],
      "postcardCaption": "Tokyo, 11pm. Warmth hiding inside the rain."
    },
    "memoryContextCount": 2,
    "createdAt": "2026-05-12T17:00:00.000Z"
  }
}
```

### `GET /api/postcards`

Optional query params:

- `travelerId`
- `limit`

### `GET /api/postcards/:id`

Fetch a single saved postcard.

### `GET /api/health`

Simple health check for frontend integration.
