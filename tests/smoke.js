#!/usr/bin/env node
/**
 * Smoke tests for Video Scavenger Hunt deployment
 * 
 * Usage:
 *   node tests/smoke.js [base-url]
 * 
 * Examples:
 *   node tests/smoke.js                        # Tests production (https://vsh.k61.dev)
 *   node tests/smoke.js http://localhost:5173  # Tests local dev
 */

const BASE_URL = process.argv[2] || 'https://vsh.k61.dev';

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log(`\n🧪 Running smoke tests against: ${BASE_URL}\n`);
  
  let passed = 0;
  let failed = 0;

  // Test 1: Landing page loads
  if (await test('Landing page loads', async () => {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    // Check for any indication this is our app
    if (!html.includes('scavenger') && !html.includes('Scavenger') && !html.includes('vite')) {
      throw new Error('Page content missing expected markers');
    }
  })) passed++; else failed++;

  // Test 2: API /me endpoint responds
  if (await test('API /api/me responds', async () => {
    const res = await fetch(`${BASE_URL}/api/me`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (typeof data.isAuthenticated !== 'boolean') {
      throw new Error('Invalid response structure');
    }
  })) passed++; else failed++;

  // Test 3: API /scenarios endpoint responds
  if (await test('API /api/scenarios responds', async () => {
    const res = await fetch(`${BASE_URL}/api/scenarios`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Expected array of scenarios');
    }
    if (data.length === 0) {
      throw new Error('Scenarios not seeded');
    }
  })) passed++; else failed++;

  // Test 4: Static assets are served (check for CSS file)
  if (await test('Static assets load', async () => {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const html = await res.text();
    // Check that we have script and style tags (built app)
    if (!html.includes('<script') || !html.includes('type="module"')) {
      throw new Error('Missing expected script tags');
    }
  })) passed++; else failed++;

  // Test 5: Invalid game code returns proper error
  if (await test('Invalid game returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/games/ZZZZ`);
    if (res.status !== 404) {
      throw new Error(`Expected 404, got ${res.status}`);
    }
  })) passed++; else failed++;

  // Summary
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  
  return failed === 0;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
