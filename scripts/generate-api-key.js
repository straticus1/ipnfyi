#!/usr/bin/env node

const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

async function createApiKey(login, isAdmin = false) {
  if (!login) {
    console.error('Usage: node generate-api-key.js <afterdark-login> [--admin]');
    console.error('Example: node generate-api-key.js myuser');
    console.error('Example: node generate-api-key.js admin --admin');
    process.exit(1);
  }

  try {
    const apiKey = generateApiKey();

    // Check if user already has a key
    const existing = await pool.query(
      'SELECT api_key, is_admin FROM api_keys WHERE afterdark_login = $1',
      [login]
    );

    if (existing.rows.length > 0) {
      console.log(`User ${login} already has an API key: ${existing.rows[0].api_key}`);
      console.log(`Admin: ${existing.rows[0].is_admin ? 'Yes' : 'No'}`);
      console.log('To generate a new key, delete the existing one first.');
      process.exit(1);
    }

    // Insert new API key
    await pool.query(
      'INSERT INTO api_keys (afterdark_login, api_key, is_admin) VALUES ($1, $2, $3)',
      [login, apiKey, isAdmin]
    );

    console.log('API Key generated successfully!');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log(`User:    ${login}`);
    console.log(`API Key: ${apiKey}`);
    console.log(`Admin:   ${isAdmin ? 'Yes (can create any subdomain)' : 'No (can only update own subdomain)'}`);
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('\nKeep this key secure. It will not be shown again.');

  } catch (error) {
    console.error('Error generating API key:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const args = process.argv.slice(2);
const login = args[0];
const isAdmin = args.includes('--admin');

createApiKey(login, isAdmin);
