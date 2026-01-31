const express = require('express');
const { Pool } = require('pg');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Serve static frontend
app.use(express.static('public'));

// Helper function to validate IP addresses
function isValidIPv4(ip) {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(ip)) return false;
  return ip.split('.').every(octet => parseInt(octet) >= 0 && parseInt(octet) <= 255);
}

function isValidIPv6(ip) {
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  return ipv6Regex.test(ip);
}

function isValidDomain(domain) {
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;
  return domainRegex.test(domain);
}

// Authenticate API key middleware
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const result = await pool.query(
      'SELECT afterdark_login, is_admin FROM api_keys WHERE api_key = $1 AND is_active = true',
      [apiKey]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Update last_used timestamp
    await pool.query(
      'UPDATE api_keys SET last_used = NOW() WHERE api_key = $1',
      [apiKey]
    );

    req.user = result.rows[0].afterdark_login;
    req.isAdmin = result.rows[0].is_admin || false;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

// Generate NSD zone file
async function generateZoneFile() {
  try {
    const result = await pool.query(`
      SELECT domain, current_ipv4, current_ipv6
      FROM dns_records
      WHERE current_ipv4 IS NOT NULL OR current_ipv6 IS NOT NULL
      ORDER BY domain
    `);

    const baseDomain = process.env.BASE_DOMAIN || 'n.ipn.fyi';
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

    const zoneFile = process.env.NSD_ZONE_FILE || '/etc/nsd/zones/n.ipn.fyi.zone';
    await fs.writeFile(zoneFile, zoneContent);

    // Reload NSD
    const nsdControl = process.env.NSD_CONTROL_PATH || '/usr/sbin/nsd-control';
    await execAsync(`${nsdControl} reload ${baseDomain}`);

    console.log('Zone file updated and NSD reloaded');
    return true;
  } catch (error) {
    console.error('Zone file generation error:', error);
    throw error;
  }
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ipn.fyi DDNS' });
});

// Update IP address
app.post('/api/update', authenticateApiKey, async (req, res) => {
  const { domain, ipv4, ipv6, comments, ref_num } = req.body;
  const user = req.user;
  const isAdmin = req.isAdmin;

  // Validate domain
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  // Check permissions: non-admin users can only update their own domain
  if (!isAdmin && domain !== user) {
    return res.status(403).json({
      error: 'Permission denied',
      message: `You can only update ${user}.n.ipn.fyi. To update ${domain}.n.ipn.fyi, use an admin key.`
    });
  }

  // Validate at least one IP is provided
  if (!ipv4 && !ipv6) {
    return res.status(400).json({ error: 'At least one IP address (IPv4 or IPv6) required' });
  }

  // Validate IP addresses if provided
  if (ipv4 && !isValidIPv4(ipv4)) {
    return res.status(400).json({ error: 'Invalid IPv4 address' });
  }

  if (ipv6 && !isValidIPv6(ipv6)) {
    return res.status(400).json({ error: 'Invalid IPv6 address' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);

    // For admin users updating domains, store under the domain name as the user
    // For regular users, store under their username
    const ownerLogin = isAdmin ? domain : user;

    // Check if record exists
    const existing = await pool.query(
      'SELECT current_ipv4, current_ipv6, version FROM dns_records WHERE afterdark_login = $1 AND domain = $2',
      [ownerLogin, domain]
    );

    if (existing.rows.length > 0) {
      // Update existing record
      const current = existing.rows[0];
      await pool.query(`
        UPDATE dns_records
        SET
          last_ipv4 = current_ipv4,
          last_ipv6 = current_ipv6,
          current_ipv4 = $1,
          current_ipv6 = $2,
          updated_at = $3,
          comments = $4,
          ref_num = $5,
          version = version + 1
        WHERE afterdark_login = $6 AND domain = $7
      `, [ipv4, ipv6, timestamp, comments, ref_num, ownerLogin, domain]);
    } else {
      // Insert new record
      await pool.query(`
        INSERT INTO dns_records
        (afterdark_login, domain, current_ipv4, current_ipv6, updated_at, comments, ref_num)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [ownerLogin, domain, ipv4, ipv6, timestamp, comments, ref_num]);
    }

    // Regenerate zone file
    await generateZoneFile();

    res.json({
      success: true,
      domain: `${domain}.${process.env.BASE_DOMAIN || 'n.ipn.fyi'}`,
      ipv4: ipv4 || null,
      ipv6: ipv6 || null,
      updated_at: timestamp
    });

  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update DNS record' });
  }
});

// Get current record(s)
app.get('/api/records', authenticateApiKey, async (req, res) => {
  const user = req.user;
  const { domain } = req.query;

  try {
    let query, params;

    if (domain) {
      query = `
        SELECT domain, current_ipv4, current_ipv6, updated_at, comments, ref_num, version
        FROM dns_records
        WHERE afterdark_login = $1 AND domain = $2
      `;
      params = [user, domain];
    } else {
      query = `
        SELECT domain, current_ipv4, current_ipv6, updated_at, comments, ref_num, version
        FROM dns_records
        WHERE afterdark_login = $1
        ORDER BY domain
      `;
      params = [user];
    }

    const result = await pool.query(query, params);
    res.json({ records: result.rows });

  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to retrieve records' });
  }
});

// Get IP history
app.get('/api/history', authenticateApiKey, async (req, res) => {
  const user = req.user;
  const { domain, limit = 50 } = req.query;

  try {
    let query, params;

    if (domain) {
      query = `
        SELECT domain, ipv4, ipv6, changed_at, change_type
        FROM ip_history
        WHERE afterdark_login = $1 AND domain = $2
        ORDER BY changed_at DESC
        LIMIT $3
      `;
      params = [user, domain, limit];
    } else {
      query = `
        SELECT domain, ipv4, ipv6, changed_at, change_type
        FROM ip_history
        WHERE afterdark_login = $1
        ORDER BY changed_at DESC
        LIMIT $2
      `;
      params = [user, limit];
    }

    const result = await pool.query(query, params);
    res.json({ history: result.rows });

  } catch (error) {
    console.error('History query error:', error);
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

// Delete a record
app.delete('/api/record/:domain', authenticateApiKey, async (req, res) => {
  const user = req.user;
  const { domain } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM dns_records WHERE afterdark_login = $1 AND domain = $2 RETURNING domain',
      [user, domain]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Regenerate zone file
    await generateZoneFile();

    res.json({ success: true, deleted: domain });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

// Simple GET-based update (for easy curl/wget usage)
app.get('/api/update', authenticateApiKey, async (req, res) => {
  const { domain, ipv4, ipv6 } = req.query;

  // Reuse POST handler logic
  req.body = { domain, ipv4, ipv6 };
  return app._router.handle(req, res);
});

// Start server
app.listen(port, () => {
  console.log(`ipn.fyi DDNS API running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await pool.end();
  process.exit(0);
});
