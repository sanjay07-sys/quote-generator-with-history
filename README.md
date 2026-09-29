# Quote Generator with History

A full-stack, responsive web application for discovering inspiring quotes, automatically falling back to an archival seed dataset during network/API failures, and curating a persistent personal favorites library backed by SQLite.

---

## Objective

The objective of this project is to build a reliable, fault-tolerant, and user-friendly full-stack quote management application that demonstrates:
- Clean client-server separation using Vanilla JavaScript and Node.js/Express.
- Seamless external REST API integration with timeout safeguards and defensive fallback mechanisms.
- Persistent local data storage using SQLite (`sqlite3`) with parameterized SQL queries.
- Instant, non-reloading UI updates with loading states, empty states, and toast notifications.

---

## Features

- **Random Quote Generation**: Fetches inspirational quotes from a public API dynamically without reloading the page.
- **Fail-Safe Fallback Engine**: If the public API encounters network delays, downtime, timeouts (3.5s limit), or bad responses, the backend automatically serves a quote from the official 80-record seed dataset (`quote_history_seed.json`).
- **Data Source Transparency**: Clear, subtle visual badge indicates whether a quote originated live from the public API or from the local fallback archive.
- **Save to Favorites**: Allows users to save favorite quotes into an SQLite database with duplicate prevention.
- **Favorites History**: Real-time list of all saved quotes, ordered with the newest entries first, complete with topic badges and formatted creation timestamps.
- **Copy to Clipboard**: Seamless 1-click clipboard copying formatted as:
  ```text
  "Quote text"
  — Author
  ```
  with visual confirmation ("Copied!") and fallback support for restricted browser contexts.
- **Delete from Favorites**: Remove saved favorites from the SQLite database and UI instantly with smooth transitions.
- **Double-Click & Concurrency Guard**: Buttons enter a disabled state while operations are running to prevent duplicate network calls.
- **XSS & Injection Protection**: Parameterized SQLite queries and safe DOM text node injection prevent SQL injection and cross-site scripting (XSS).

---

## Tech Stack

- **Frontend**: HTML5, Modern CSS3 (CSS Custom Properties, Glassmorphism, Responsive Flexbox & CSS Grid), Vanilla JavaScript (ES6+ `fetch` API, no frontend frameworks).
- **Backend**: Node.js, Express.js.
- **Database**: SQLite (`sqlite3` package) with auto-created tables and indexes.

---

## How the External Quote API Works

1. When the user requests a new quote (or during initial page load), the frontend calls `GET /api/quote`.
2. The Express server initiates a server-to-server HTTP request to the public API (`https://dummyjson.com/quotes/random`).
3. An `AbortSignal.timeout(3500)` ensures that requests taking longer than 3.5 seconds are aborted to prevent hung states.
4. The server validates the external payload structure (ensuring `quote` and `author` are non-empty strings).
5. If valid, the normalized quote is returned to the client marked with `source: "api"`.

---

## Fallback Dataset Behavior

The system includes the official 80-record dataset: `quote_history_seed.json`.

- The seed dataset is loaded safely into memory when the server boots.
- Each record has the schema:
  - `id`: Unique identifier
  - `text`: Quote content
  - `author`: Attribution
  - `topic`: Subject classification (e.g., Learning, Work, Creativity)
- If the external API fails for **any reason** (timeout, network outage, HTTP 5xx/4xx, malformed JSON, or missing fields), the backend helper `getRandomFallbackQuote()` selects a random record from the 80 seed entries and returns it with `source: "fallback"`.
- The frontend clearly displays a `Seed Fallback Archive` status tag without disrupting the user experience or displaying broken UI components.

---

## SQLite Database Information

- **Database File**: `quotes.db` (created automatically in the project root on server startup).
- **Git Status**: Ignored via `.gitignore`.
- **Table Schema**:
  ```sql
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote TEXT NOT NULL,
    author TEXT NOT NULL,
    topic TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_favorites_quote ON favorites(quote, author);
  ```
- All database interactions use parameterized statements (`?` placeholders) to prevent SQL injection attacks.

---

## Project Structure

```
quote-generator/
│
├── .gitignore               # Excludes node_modules/ and quotes.db
├── README.md                # Project documentation
├── quote_history_seed.json  # Official 80-record fallback dataset
├── package.json             # Manifest with scripts and dependencies
├── package-lock.json        # Locked dependency versions
├── server.js                # Express server, SQLite setup, API endpoints
├── test.js                  # Automated E2E verification test suite
├── quotes.db                # SQLite database (auto-generated at runtime)
│
└── public/
    ├── index.html           # Main semantic HTML5 structure
    ├── style.css            # Responsive modern styles & animations
    └── app.js               # Client-side logic and DOM interactions
```

---

## API Endpoints

### 1. Health Check
- **Endpoint**: `GET /api/health`
- **Response**: `200 OK`
  ```json
  {
    "status": "ok",
    "uptime": 120,
    "timestamp": "2026-09-29T08:45:00.000Z"
  }
  ```

### 2. Fetch Random Quote
- **Endpoint**: `GET /api/quote`
- **Optional Query**: `?fallback=true` (forces retrieval from fallback archive)
- **Response**: `200 OK`
  ```json
  {
    "quote": "Sample quotation 1 for API fallback testing.",
    "author": "Sample Author 14",
    "topic": "Learning",
    "source": "fallback"
  }
  ```

### 3. List Favorites History
- **Endpoint**: `GET /api/favorites`
- **Response**: `200 OK` (Array sorted newest first)
  ```json
  [
    {
      "id": 1,
      "quote": "No Great Intellectual Thing Was Ever Done By Great Effort.",
      "author": "Sample Author",
      "topic": "Inspiration",
      "created_at": "2026-09-29 08:42:15"
    }
  ]
  ```

### 4. Save Favorite Quote
- **Endpoint**: `POST /api/favorites`
- **Request Body**:
  ```json
  {
    "quote": "Life is what happens when you're busy making other plans.",
    "author": "John Lennon",
    "topic": "Life"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "message": "Quote saved to favorites successfully!",
    "favorite": {
      "id": 2,
      "quote": "Life is what happens when you're busy making other plans.",
      "author": "John Lennon",
      "topic": "Life",
      "created_at": "2026-09-29 08:45:22"
    }
  }
  ```
- **Duplicate Prevention Response**: `409 Conflict`
  ```json
  {
    "message": "Quote already exists in favorites.",
    "isDuplicate": true,
    "existingId": 2
  }
  ```

### 5. Delete Favorite Quote
- **Endpoint**: `DELETE /api/favorites/:id`
- **Response**: `200 OK`
  ```json
  {
    "message": "Favorite removed successfully.",
    "id": 2
  }
  ```

---

## Installation & Running Locally

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
- npm (Node Package Manager)

### Step 1: Install Dependencies
Open your terminal in the `quote-generator` folder and run:
```bash
npm install
```

### Step 2: Start the Server
Run the standard start script:
```bash
npm start
```
The server will boot and display:
```
====================================================
Quote Generator with History is running!
Local URL: http://localhost:3000
Health Check: http://localhost:3000/api/health
API Endpoint: http://localhost:3000/api/quote
Fallback dataset loaded: 80 records
====================================================
```

### Step 3: Open in Browser
Open your browser and navigate to:
```
http://localhost:3000
```

---

## Running the Automated Test Suite

A built-in test suite verifies all backend endpoints, seed data integrity, fallback mechanics, and database persistence:

1. Ensure the server is running on `http://localhost:3000`.
2. In a separate terminal, run:
```bash
npm test
```

---

## Error Handling

- **Network / API Outage**: Seamlessly caught; fallback quote returned with HTTP 200 and `source: "fallback"`.
- **Invalid POST Payloads**: Validates non-empty strings and enforces character limits (Quote: 2000 chars, Author: 200 chars, Topic: 100 chars); returns HTTP 400.
- **Duplicate Favorites**: Automatically detected via `SELECT id FROM favorites WHERE quote = ? AND author = ?`; returns HTTP 409 with explanatory message.
- **Resource Not Found**: Deleting a non-existent or previously deleted ID returns HTTP 404.
- **Database Failure**: SQLite operational errors return HTTP 500 with sanitized error responses.

---

## Deployment Instructions

1. Ensure environment variable `PORT` is supported by your hosting provider (e.g., Render, Railway, Heroku, or VPS).
2. Set the startup command to `npm start`.
3. Ensure persistent volume storage is configured if you wish SQLite `quotes.db` to survive server restarts across container redeployments, or deploy to a persistent Linux VPS.
