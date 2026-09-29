/**
 * Automated Test Suite for Quote Generator with History
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';
let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failCount++;
  }
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, options);
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log('====================================================');
  console.log('Running Automated Tests for Quote Generator');
  console.log('====================================================\n');

  // Test 1: Seed Dataset Integrity
  console.log('1. Checking Seed Dataset Integrity (quote_history_seed.json)...');
  const seedPath = path.join(__dirname, 'quote_history_seed.json');
  const seedExists = fs.existsSync(seedPath);
  assert(seedExists, 'quote_history_seed.json exists');
  const seedRecords = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  assert(Array.isArray(seedRecords), 'Seed dataset is an array');
  assert(seedRecords.length === 80, `Seed dataset contains exactly 80 records (found ${seedRecords.length})`);
  const sample = seedRecords[0];
  assert(sample.id && sample.text && sample.author && sample.topic, 'Seed record fields: id, text, author, topic');

  // Test 2: Health Check
  console.log('\n2. Testing GET /api/health...');
  const healthRes = await request('/api/health');
  assert(healthRes.status === 200, 'Health endpoint returns HTTP 200');
  assert(healthRes.data && healthRes.data.status === 'ok', 'Health status is "ok"');

  // Test 3: GET /api/quote (Live or fallback)
  console.log('\n3. Testing GET /api/quote...');
  const quoteRes = await request('/api/quote');
  assert(quoteRes.status === 200, 'Quote endpoint returns HTTP 200');
  assert(typeof quoteRes.data.quote === 'string' && quoteRes.data.quote.length > 0, 'Quote text is non-empty string');
  assert(typeof quoteRes.data.author === 'string' && quoteRes.data.author.length > 0, 'Quote author is non-empty string');
  assert(['api', 'fallback'].includes(quoteRes.data.source), `Quote source is valid ("${quoteRes.data.source}")`);

  // Test 4: Fallback Quote Behavior
  console.log('\n4. Testing Fallback Behavior (forced fallback mode)...');
  const fallbackRes = await request('/api/quote?fallback=true');
  assert(fallbackRes.status === 200, 'Fallback request returns HTTP 200');
  assert(fallbackRes.data.source === 'fallback', 'Fallback quote source indicates "fallback"');
  const matchingSeed = seedRecords.find(r => r.text === fallbackRes.data.quote && r.author === fallbackRes.data.author);
  assert(matchingSeed !== undefined, 'Fallback quote originates directly from official 80-record seed dataset');

  // Test 5: Validation - Bad POST /api/favorites
  console.log('\n5. Testing Input Validation on POST /api/favorites...');
  const emptyBodyRes = await request('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert(emptyBodyRes.status === 400, 'Empty body returns HTTP 400 Bad Request');

  const missingAuthorRes = await request('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quote: 'Some valid quote', author: '' })
  });
  assert(missingAuthorRes.status === 400, 'Empty author returns HTTP 400 Bad Request');

  // Test 6: POST /api/favorites (Save Favorite)
  console.log('\n6. Testing POST /api/favorites (Save valid favorite)...');
  const testQuote = {
    quote: `Automated Test Quote - ${Date.now()}`,
    author: 'Test Author',
    topic: 'Testing'
  };
  const saveRes = await request('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testQuote)
  });
  assert(saveRes.status === 201, 'Saving favorite returns HTTP 201 Created');
  assert(saveRes.data && saveRes.data.favorite && saveRes.data.favorite.id > 0, 'Saved favorite contains valid generated database ID');
  const savedId = saveRes.data.favorite.id;

  // Test 7: Duplicate Favorite Prevention
  console.log('\n7. Testing Duplicate Favorite Prevention...');
  const duplicateRes = await request('/api/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testQuote)
  });
  assert(duplicateRes.status === 409, 'Duplicate favorite returns HTTP 409 Conflict');
  assert(duplicateRes.data.message.includes('already exists in favorites'), 'Duplicate returns clear message: "Quote already exists in favorites."');

  // Test 8: GET /api/favorites (Fetch History, newest first)
  console.log('\n8. Testing GET /api/favorites (List favorites)...');
  const getFavsRes = await request('/api/favorites');
  assert(getFavsRes.status === 200, 'GET /api/favorites returns HTTP 200');
  assert(Array.isArray(getFavsRes.data), 'Favorites response is an array');
  assert(getFavsRes.data.length > 0, 'Favorites array contains at least 1 record');
  assert(getFavsRes.data[0].id === savedId, 'Newest saved favorite appears first in the list');

  // Test 9: DELETE /api/favorites/:id
  console.log('\n9. Testing DELETE /api/favorites/:id...');
  const deleteRes = await request(`/api/favorites/${savedId}`, {
    method: 'DELETE'
  });
  assert(deleteRes.status === 200, 'DELETE /api/favorites/:id returns HTTP 200');
  assert(deleteRes.data && deleteRes.data.message.includes('removed'), 'Delete returns success message');

  // Test 10: DELETE non-existent / already deleted favorite
  console.log('\n10. Testing DELETE for non-existent favorite...');
  const deleteNonExistent = await request(`/api/favorites/${savedId}`, {
    method: 'DELETE'
  });
  assert(deleteNonExistent.status === 404, 'Deleting non-existent favorite returns HTTP 404 Not Found');

  // Summary
  console.log('\n====================================================');
  console.log(`Test Results: ${passCount} Passed, ${failCount} Failed`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests();
