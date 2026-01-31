#!/usr/bin/env node

/**
 * ipn.fyi DDNS CLI Management Tool
 * For operations and administration tasks
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
require('dotenv').config();

const execAsync = promisify(exec);

// Config file location
const CONFIG_DIR = path.join(os.homedir(), '.ipnfyi');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

let config = {};

// Load configuration
async function loadConfig() {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf8');
    config = JSON.parse(configData);
  } catch (err) {
    // Config file doesn't exist, use environment variables
    config = {
      database_url: process.env.DATABASE_URL,
      nsd_zone_file: process.env.NSD_ZONE_FILE,
      nsd_control_path: process.env.NSD_CONTROL_PATH,
      base_domain: process.env.BASE_DOMAIN || 'n.ipn.fyi',
      api_url: process.env.API_URL || 'https://ipn.fyi'
    };
  }
}

// Initialize config with defaults
const pool = new Pool({
  connectionString: config.database_url || process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  console.error(`${colors.red}Error: ${message}${colors.reset}`);
}

function success(message) {
  console.log(`${colors.green}✓ ${message}${colors.reset}`);
}

function info(message) {
  console.log(`${colors.blue}ℹ ${message}${colors.reset}`);
}

function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Commands

async function listKeys() {
  try {
    const result = await pool.query(`
      SELECT
        afterdark_login,
        api_key,
        is_admin,
        created_at,
        last_used,
        is_active
      FROM api_keys
      ORDER BY
        CASE WHEN is_admin THEN 0 ELSE 1 END,
        afterdark_login
    `);

    if (result.rows.length === 0) {
      info('No API keys found');
      return;
    }

    log('\nAPI Keys:', 'bright');
    log('─'.repeat(120), 'dim');

    result.rows.forEach(row => {
      const adminBadge = row.is_admin ? `${colors.yellow}[ADMIN]${colors.reset}` : '       ';
      const activeBadge = row.is_active ? `${colors.green}[ACTIVE]${colors.reset}` : `${colors.red}[INACTIVE]${colors.reset}`;
      const lastUsed = row.last_used ? new Date(row.last_used).toLocaleString() : 'Never';

      console.log(`${adminBadge} ${activeBadge} ${colors.cyan}${row.afterdark_login.padEnd(20)}${colors.reset} ${row.api_key}`);
      console.log(`       Created: ${new Date(row.created_at).toLocaleString().padEnd(30)} Last used: ${lastUsed}`);
      log('─'.repeat(120), 'dim');
    });

    console.log(`\nTotal: ${result.rows.length} key(s)\n`);
  } catch (err) {
    error(`Failed to list keys: ${err.message}`);
  }
}

async function createKey(login, isAdmin = false) {
  if (!login) {
    error('Login name required');
    console.log('Usage: ipnfyi-cli create-key <login> [--admin]');
    return;
  }

  try {
    const existing = await pool.query(
      'SELECT api_key FROM api_keys WHERE afterdark_login = $1',
      [login]
    );

    if (existing.rows.length > 0) {
      error(`User ${login} already has an API key`);
      console.log(`Existing key: ${existing.rows[0].api_key}`);
      console.log('Use "delete-key" to remove it first');
      return;
    }

    const apiKey = generateApiKey();

    await pool.query(
      'INSERT INTO api_keys (afterdark_login, api_key, is_admin) VALUES ($1, $2, $3)',
      [login, apiKey, isAdmin]
    );

    success('API Key created successfully!');
    log('─'.repeat(80), 'dim');
    log(`User:    ${login}`, 'cyan');
    log(`API Key: ${apiKey}`, 'yellow');
    log(`Admin:   ${isAdmin ? 'Yes' : 'No'}`, isAdmin ? 'yellow' : 'white');
    log('─'.repeat(80), 'dim');
  } catch (err) {
    error(`Failed to create key: ${err.message}`);
  }
}

async function deleteKey(login) {
  if (!login) {
    error('Login name required');
    console.log('Usage: ipnfyi-cli delete-key <login>');
    return;
  }

  try {
    const result = await pool.query(
      'DELETE FROM api_keys WHERE afterdark_login = $1 RETURNING api_key',
      [login]
    );

    if (result.rows.length === 0) {
      error(`No API key found for user: ${login}`);
      return;
    }

    success(`Deleted API key for user: ${login}`);
  } catch (err) {
    error(`Failed to delete key: ${err.message}`);
  }
}

async function listDomains(user = null) {
  try {
    let query = `
      SELECT
        afterdark_login,
        domain,
        current_ipv4,
        current_ipv6,
        updated_at,
        version,
        comments
      FROM dns_records
    `;
    let params = [];

    if (user) {
      query += ' WHERE afterdark_login = $1';
      params = [user];
    }

    query += ' ORDER BY domain';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      info('No domains found');
      return;
    }

    log('\nDNS Records:', 'bright');
    log('─'.repeat(120), 'dim');

    result.rows.forEach(row => {
      const fqdn = `${row.domain}.n.ipn.fyi`;
      const updated = new Date(row.updated_at * 1000).toLocaleString();

      console.log(`${colors.cyan}${fqdn.padEnd(40)}${colors.reset} ${colors.magenta}[${row.afterdark_login}]${colors.reset} v${row.version}`);
      if (row.current_ipv4) {
        console.log(`  IPv4: ${colors.green}${row.current_ipv4}${colors.reset}`);
      }
      if (row.current_ipv6) {
        console.log(`  IPv6: ${colors.green}${row.current_ipv6}${colors.reset}`);
      }
      console.log(`  Updated: ${updated}`);
      if (row.comments) {
        console.log(`  Comments: ${row.comments}`);
      }
      log('─'.repeat(120), 'dim');
    });

    console.log(`\nTotal: ${result.rows.length} domain(s)\n`);
  } catch (err) {
    error(`Failed to list domains: ${err.message}`);
  }
}

async function showHistory(domain, limit = 10) {
  if (!domain) {
    error('Domain name required');
    console.log('Usage: ipnfyi-cli history <domain> [limit]');
    return;
  }

  try {
    const result = await pool.query(`
      SELECT
        ipv4,
        ipv6,
        changed_at,
        change_type
      FROM ip_history
      WHERE domain = $1
      ORDER BY changed_at DESC
      LIMIT $2
    `, [domain, limit]);

    if (result.rows.length === 0) {
      info(`No history found for domain: ${domain}`);
      return;
    }

    log(`\nIP History for ${domain}.n.ipn.fyi:`, 'bright');
    log('─'.repeat(100), 'dim');

    result.rows.forEach(row => {
      const timestamp = new Date(row.changed_at * 1000).toLocaleString();
      const changeType = row.change_type.replace('_', ' ').toUpperCase();

      console.log(`${colors.yellow}${timestamp}${colors.reset} - ${colors.cyan}${changeType}${colors.reset}`);
      if (row.ipv4) {
        console.log(`  IPv4: ${row.ipv4}`);
      }
      if (row.ipv6) {
        console.log(`  IPv6: ${row.ipv6}`);
      }
      log('─'.repeat(100), 'dim');
    });

    console.log(`\nShowing ${result.rows.length} of last ${limit} entries\n`);
  } catch (err) {
    error(`Failed to show history: ${err.message}`);
  }
}

async function deleteDomain(domain, user = null) {
  if (!domain) {
    error('Domain name required');
    console.log('Usage: ipnfyi-cli delete-domain <domain> [user]');
    return;
  }

  try {
    let query = 'DELETE FROM dns_records WHERE domain = $1';
    let params = [domain];

    if (user) {
      query += ' AND afterdark_login = $2';
      params.push(user);
    }

    query += ' RETURNING domain, afterdark_login';

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      error(`Domain not found: ${domain}`);
      return;
    }

    success(`Deleted domain: ${result.rows[0].domain}.n.ipn.fyi (user: ${result.rows[0].afterdark_login})`);

    // Regenerate zone file
    await regenerateZone();
  } catch (err) {
    error(`Failed to delete domain: ${err.message}`);
  }
}

async function regenerateZone() {
  try {
    info('Regenerating zone file...');

    const result = await pool.query(`
      SELECT domain, current_ipv4, current_ipv6
      FROM dns_records
      WHERE current_ipv4 IS NOT NULL OR current_ipv6 IS NOT NULL
      ORDER BY domain
    `);

    const baseDomain = config.base_domain || 'n.ipn.fyi';
    const serial = Math.floor(Date.now() / 1000);

    let zoneContent = `$ORIGIN ${baseDomain}.
$TTL 300

@ IN SOA ns1.${baseDomain}. admin.${baseDomain}. (
    ${serial}     ; Serial
    3600          ; Refresh
    1800          ; Retry
    604800        ; Expire
    300 )         ; Minimum TTL

@ IN NS ns1.${baseDomain}.
@ IN NS ns2.${baseDomain}.

ns1 IN A 0.0.0.0
ns2 IN A 0.0.0.0

`;

    for (const row of result.rows) {
      if (row.current_ipv4) {
        zoneContent += `${row.domain} IN A ${row.current_ipv4}\n`;
      }
      if (row.current_ipv6) {
        zoneContent += `${row.domain} IN AAAA ${row.current_ipv6}\n`;
      }
    }

    const zoneFile = config.nsd_zone_file || '/etc/nsd/zones/n.ipn.fyi.zone';
    await fs.writeFile(zoneFile, zoneContent);

    success(`Zone file written: ${zoneFile}`);

    // Reload NSD
    const nsdControl = config.nsd_control_path || '/usr/sbin/nsd-control';
    try {
      await execAsync(`${nsdControl} reload ${baseDomain}`);
      success('NSD reloaded successfully');
    } catch (err) {
      error(`Failed to reload NSD: ${err.message}`);
    }

  } catch (err) {
    error(`Failed to regenerate zone: ${err.message}`);
  }
}

async function initConfig() {
  try {
    // Create directory if it doesn't exist
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }

    // Check if config already exists
    try {
      await fs.access(CONFIG_FILE);
      error('Config file already exists');
      console.log(`Location: ${CONFIG_FILE}`);
      console.log('Use "config edit" to modify or delete it manually');
      return;
    } catch {
      // Config doesn't exist, create it
    }

    const defaultConfig = {
      database_url: process.env.DATABASE_URL || 'postgresql://user:pass@host.neon.tech/dbname',
      nsd_zone_file: '/etc/nsd/zones/n.ipn.fyi.zone',
      nsd_control_path: '/usr/sbin/nsd-control',
      base_domain: 'n.ipn.fyi',
      api_url: 'https://ipn.fyi'
    };

    await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));

    success(`Config file created: ${CONFIG_FILE}`);
    console.log('\nPlease edit the file and update the database_url and other settings.');
    console.log(`Run: nano ${CONFIG_FILE}`);

  } catch (err) {
    error(`Failed to initialize config: ${err.message}`);
  }
}

async function showConfig() {
  try {
    await loadConfig();

    log('\nConfiguration:', 'bright');
    log('─'.repeat(80), 'dim');
    log(`Config file: ${CONFIG_FILE}`, 'dim');
    log('─'.repeat(80), 'dim');
    log(`Database URL:     ${config.database_url ? '***' + config.database_url.slice(-20) : 'Not set'}`, 'cyan');
    log(`NSD Zone File:    ${config.nsd_zone_file || 'Not set'}`, 'cyan');
    log(`NSD Control Path: ${config.nsd_control_path || 'Not set'}`, 'cyan');
    log(`Base Domain:      ${config.base_domain || 'Not set'}`, 'cyan');
    log(`API URL:          ${config.api_url || 'Not set'}`, 'cyan');
    log('─'.repeat(80), 'dim');
    console.log();

  } catch (err) {
    error(`Failed to show config: ${err.message}`);
  }
}

async function showStats() {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM api_keys WHERE is_active = true) as active_keys,
        (SELECT COUNT(*) FROM api_keys WHERE is_admin = true) as admin_keys,
        (SELECT COUNT(*) FROM dns_records) as total_domains,
        (SELECT COUNT(DISTINCT afterdark_login) FROM dns_records) as unique_users,
        (SELECT COUNT(*) FROM ip_history) as total_history_entries
    `);

    const row = stats.rows[0];

    log('\nService Statistics:', 'bright');
    log('─'.repeat(60), 'dim');
    log(`Active API Keys:        ${colors.green}${row.active_keys}${colors.reset}`);
    log(`Admin Keys:             ${colors.yellow}${row.admin_keys}${colors.reset}`);
    log(`Total Domains:          ${colors.cyan}${row.total_domains}${colors.reset}`);
    log(`Unique Users:           ${colors.magenta}${row.unique_users}${colors.reset}`);
    log(`History Entries:        ${colors.blue}${row.total_history_entries}${colors.reset}`);
    log('─'.repeat(60), 'dim');
    console.log();
  } catch (err) {
    error(`Failed to get stats: ${err.message}`);
  }
}

async function testConnection() {
  try {
    info('Testing database connection...');
    const result = await pool.query('SELECT NOW() as time, version() as pg_version');
    success('Database connection successful!');
    log(`Time: ${result.rows[0].time}`, 'dim');
    log(`PostgreSQL: ${result.rows[0].pg_version}`, 'dim');

    // Test NSD
    info('\nTesting NSD...');
    const nsdControl = config.nsd_control_path || '/usr/sbin/nsd-control';
    try {
      const { stdout } = await execAsync(`${nsdControl} status`);
      success('NSD is running');
      log(stdout.trim(), 'dim');
    } catch (err) {
      error(`NSD test failed: ${err.message}`);
    }
  } catch (err) {
    error(`Connection test failed: ${err.message}`);
  }
}

function showHelp() {
  console.log(`
${colors.bright}ipn.fyi DDNS CLI Management Tool${colors.reset}

${colors.cyan}Usage:${colors.reset}
  ipnfyi-cli <command> [options]

${colors.cyan}Commands:${colors.reset}

  ${colors.green}Configuration:${colors.reset}
    config init                  Initialize config file at ~/.ipnfyi/config.json
    config show                  Display current configuration

  ${colors.green}API Key Management:${colors.reset}
    list-keys                    List all API keys
    create-key <login> [--admin] Create new API key
    delete-key <login>           Delete an API key

  ${colors.green}Domain Management:${colors.reset}
    list-domains [user]          List all domains (optionally filter by user)
    delete-domain <domain> [user] Delete a domain
    history <domain> [limit]     Show IP change history (default: 10 entries)

  ${colors.green}System Operations:${colors.reset}
    regenerate-zone              Regenerate NSD zone file and reload
    stats                        Show service statistics
    test                         Test database and NSD connectivity

  ${colors.green}Other:${colors.reset}
    help                         Show this help message

${colors.cyan}Examples:${colors.reset}
  ipnfyi-cli config init
  ipnfyi-cli config show
  ipnfyi-cli list-keys
  ipnfyi-cli create-key johndoe
  ipnfyi-cli create-key admin --admin
  ipnfyi-cli list-domains
  ipnfyi-cli list-domains rams
  ipnfyi-cli history myserver 20
  ipnfyi-cli delete-domain oldserver
  ipnfyi-cli stats

${colors.cyan}Configuration:${colors.reset}
  Config file: ~/.ipnfyi/config.json
  Falls back to .env file if config.json doesn't exist
`);
}

// Main command router
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const subCommand = args[1];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  // Handle config commands (don't need DB connection)
  if (command === 'config') {
    if (subCommand === 'init') {
      await initConfig();
      process.exit(0);
    } else if (subCommand === 'show') {
      await showConfig();
      process.exit(0);
    } else {
      error('Invalid config command');
      console.log('Valid commands: config init, config show');
      process.exit(1);
    }
  }

  // Load config for all other commands
  await loadConfig();

  // Update pool connection with loaded config
  pool.options.connectionString = config.database_url;

  try {
    switch (command) {
      case 'list-keys':
        await listKeys();
        break;

      case 'create-key':
        const login = args[1];
        const isAdmin = args.includes('--admin');
        await createKey(login, isAdmin);
        break;

      case 'delete-key':
        await deleteKey(args[1]);
        break;

      case 'list-domains':
        await listDomains(args[1]);
        break;

      case 'delete-domain':
        await deleteDomain(args[1], args[2]);
        break;

      case 'history':
        await showHistory(args[1], parseInt(args[2]) || 10);
        break;

      case 'regenerate-zone':
        await regenerateZone();
        break;

      case 'stats':
        await showStats();
        break;

      case 'test':
        await testConnection();
        break;

      default:
        error(`Unknown command: ${command}`);
        console.log('Run "ipnfyi-cli help" for usage information');
        process.exit(1);
    }
  } catch (err) {
    error(`Command failed: ${err.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run
main().catch(err => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});
