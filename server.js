const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// 1. Safe Loading of Fallback Seed Dataset
// ----------------------------------------------------
const SEED_FILE = path.join(__dirname, 'quote_history_seed.json');
let fallbackQuotes = [];

try {
  const seedRaw = fs.readFileSync(SEED_FILE, 'utf8');
  fallbackQuotes = JSON.parse(seedRaw);
  if (!Array.isArray(fallbackQuotes) || fallbackQuotes.length === 0) {
    throw new Error('Seed dataset is empty or not an array');
  }
  console.log(`[Seed Dataset] Successfully loaded ${fallbackQuotes.length} fallback quotes from quote_history_seed.json`);
} catch (err) {
  console.error('[Seed Dataset Error] Failed to load quote_history_seed.json:', err.message);
  process.exit(1);
}

/**
 * Returns a random quote record from the official 80-record fallback dataset
 */
function getRandomFallbackQuote() {
  const randomIndex = Math.floor(Math.random() * fallbackQuotes.length);
  const item = fallbackQuotes[randomIndex];
  return {
    quote: item.text,
    author: item.author,
    topic: item.topic || 'General',
    source: 'fallback'
  };
}

// ----------------------------------------------------
// 2. SQLite Database Setup (quotes.db)
// ----------------------------------------------------
const DB_PATH = path.join(__dirname, 'quotes.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[Database Error] Failed to open SQLite database:', err.message);
  } else {
    console.log('[Database] Connected to SQLite database: quotes.db');
  }
});

// Create table if not exists with indexes
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote TEXT NOT NULL,
      author TEXT NOT NULL,
      topic TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('[Database Error] Failed to create favorites table:', err.message);
    } else {
      console.log('[Database] Favorites table verified/ready.');
    }
  });

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_favorites_quote ON favorites(quote, author)
  `);
});

// ----------------------------------------------------
// 3. Helper: Fetch from Public Quote API with Fallback
// ----------------------------------------------------
const EXTERNAL_API_URL = 'https://dummyjson.com/quotes/random';
const API_TIMEOUT_MS = 3500;

async function fetchQuoteWithFallback(forceFallback = false) {
  if (forceFallback) {
    console.log('[Quote Service] Force fallback requested.');
    return getRandomFallbackQuote();
  }

  try {
    const response = await fetch(EXTERNAL_API_URL, {
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`External API returned status HTTP ${response.status}`);
    }

    const data = await response.json();

    // Validate external response schema
    if (!data || typeof data.quote !== 'string' || !data.quote.trim()) {
      throw new Error('External API response missing or invalid quote text');
    }
    if (typeof data.author !== 'string' || !data.author.trim()) {
      throw new Error('External API response missing or invalid author');
    }

    return {
      quote: data.quote.trim(),
      author: data.author.trim(),
      topic: 'Inspiration',
      source: 'api'
    };
  } catch (err) {
    console.warn(`[External API Warning] ${err.message}. Seamlessly falling back to official seed dataset.`);
    return getRandomFallbackQuote();
  }
}

// ----------------------------------------------------
// 4. API Endpoints
// ----------------------------------------------------

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/quote
 * Returns a random quote (from external API or fallback)
 * Optional query parameter ?fallback=true to explicitly test fallback
 */
app.get('/api/quote', async (req, res) => {
  try {
    const forceFallback = req.query.fallback === 'true';
    const quoteData = await fetchQuoteWithFallback(forceFallback);
    res.json(quoteData);
  } catch (err) {
    console.error('[Error in /api/quote]:', err);
    // Ultimate safety: return fallback even on unexpected error
    res.json(getRandomFallbackQuote());
  }
});

/**
 * GET /api/favorites
 * Returns all saved favorite quotes, sorted newest first
 */
app.get('/api/favorites', (req, res) => {
  const sql = `
    SELECT id, quote, author, topic, created_at 
    FROM favorites 
    ORDER BY created_at DESC, id DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('[Database Error /api/favorites]:', err.message);
      return res.status(500).json({ error: 'Failed to retrieve favorites from database.' });
    }
    res.json(rows || []);
  });
});

/**
 * POST /api/favorites
 * Saves a favorite quote with duplicate prevention and validation
 */
app.post('/api/favorites', (req, res) => {
  let { quote, author, topic } = req.body || {};

  // Input validation
  if (!quote || typeof quote !== 'string' || !quote.trim()) {
    return res.status(400).json({ error: 'Quote text is required and cannot be empty.' });
  }
  if (!author || typeof author !== 'string' || !author.trim()) {
    return res.status(400).json({ error: 'Quote author is required and cannot be empty.' });
  }

  quote = quote.trim();
  author = author.trim();
  topic = (topic && typeof topic === 'string' && topic.trim()) ? topic.trim() : 'General';

  // Length guards
  if (quote.length > 2000) {
    return res.status(400).json({ error: 'Quote text exceeds maximum allowed length (2000 characters).' });
  }
  if (author.length > 200) {
    return res.status(400).json({ error: 'Author name exceeds maximum allowed length (200 characters).' });
  }
  if (topic.length > 100) {
    return res.status(400).json({ error: 'Topic exceeds maximum allowed length (100 characters).' });
  }

  // Check for duplicate favorite
  const checkSql = `SELECT id FROM favorites WHERE quote = ? AND author = ? LIMIT 1`;
  db.get(checkSql, [quote, author], (err, existing) => {
    if (err) {
      console.error('[Database Error duplicate check]:', err.message);
      return res.status(500).json({ error: 'Database error occurred while checking for duplicates.' });
    }

    if (existing) {
      return res.status(409).json({
        message: 'Quote already exists in favorites.',
        isDuplicate: true,
        existingId: existing.id
      });
    }

    // Insert new favorite
    const insertSql = `INSERT INTO favorites (quote, author, topic) VALUES (?, ?, ?)`;
    db.run(insertSql, [quote, author, topic], function (insertErr) {
      if (insertErr) {
        console.error('[Database Error insert favorite]:', insertErr.message);
        return res.status(500).json({ error: 'Failed to save quote to favorites.' });
      }

      // Retrieve the newly inserted record with timestamp
      db.get(`SELECT id, quote, author, topic, created_at FROM favorites WHERE id = ?`, [this.lastID], (getErr, row) => {
        if (getErr || !row) {
          return res.status(201).json({
            message: 'Quote saved to favorites successfully!',
            favorite: {
              id: this.lastID,
              quote,
              author,
              topic,
              created_at: new Date().toISOString()
            }
          });
        }
        res.status(201).json({
          message: 'Quote saved to favorites successfully!',
          favorite: row
        });
      });
    });
  });
});

/**
 * DELETE /api/favorites/:id
 * Deletes a favorite by database ID
 */
app.delete('/api/favorites/:id', (req, res) => {
  const favoriteId = parseInt(req.params.id, 10);

  if (isNaN(favoriteId) || favoriteId <= 0) {
    return res.status(400).json({ error: 'Invalid favorite ID provided.' });
  }

  const deleteSql = `DELETE FROM favorites WHERE id = ?`;
  db.run(deleteSql, [favoriteId], function (err) {
    if (err) {
      console.error('[Database Error delete favorite]:', err.message);
      return res.status(500).json({ error: 'Failed to delete favorite from database.' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Favorite not found.' });
    }

    res.json({
      message: 'Favorite removed successfully.',
      id: favoriteId
    });
  });
});

// ----------------------------------------------------
// 5. Global Error & 404 Handlers
// ----------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Clean shutdown handler
function gracefulShutdown() {
  console.log('\nShutting down server gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing SQLite database:', err.message);
    } else {
      console.log('SQLite database connection closed.');
    }
    process.exit(0);
  });
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Start server
const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Quote Generator with History is running!`);
  console.log(`Local URL: http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
  console.log(`API Endpoint: http://localhost:${PORT}/api/quote`);
  console.log(`Fallback dataset loaded: ${fallbackQuotes.length} records`);
  console.log(`====================================================`);
});

module.exports = { app, server, db, getRandomFallbackQuote };
