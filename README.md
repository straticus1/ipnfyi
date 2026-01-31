# ipn.fyi - Dynamic DNS Service

A key-based dynamic DNS service powered by DNS Science, allowing users to maintain stable hostnames for systems with changing IP addresses.

## Features

- **API-based updates**: Simple REST API for automated IP updates
- **IPv4 & IPv6 support**: Full dual-stack support
- **IP history tracking**: Maintains last 250 IP changes per user
- **Key-based authentication**: Secure API key authentication
- **NSD integration**: Fast, authoritative DNS service
- **Low latency**: Powered by Neon PostgreSQL for fast queries

## System Requirements

- Node.js 16+ (for API server)
- PostgreSQL (Neon recommended)
- NSD (Name Server Daemon)
- Nginx (for reverse proxy and static content)
- Linux server (tested on Ubuntu 22.04)

## Installation

### 1. Database Setup

First, create a Neon PostgreSQL database and run the schema:

```bash
psql $DATABASE_URL -f schema.sql
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the example environment file and edit it:

```bash
cp .env.example .env
nano .env
```

Set your database URL and other configuration:

```env
DATABASE_URL=postgresql://user:password@host.neon.tech/dbname?sslmode=require
PORT=3000
NSD_ZONE_DIR=/etc/nsd/zones
NSD_ZONE_FILE=/etc/nsd/zones/n.ipn.fyi.zone
BASE_DOMAIN=n.ipn.fyi
```

### 4. Configure NSD

Copy the example NSD configuration:

```bash
sudo cp nsd.conf.example /etc/nsd/conf.d/ipn.fyi.conf
```

Create the zones directory:

```bash
sudo mkdir -p /etc/nsd/zones
sudo chown nsd:nsd /etc/nsd/zones
```

Generate NSD control certificates:

```bash
sudo nsd-control-setup
```

Restart NSD:

```bash
sudo systemctl restart nsd
```

### 5. Configure Nginx

Copy the nginx configuration:

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/ipn.fyi
sudo ln -s /etc/nginx/sites-available/ipn.fyi /etc/nginx/sites-enabled/
```

Copy the public files:

```bash
sudo mkdir -p /var/www/ipn.fyi
sudo cp -r public /var/www/ipn.fyi/
```

Get SSL certificates with Let's Encrypt:

```bash
sudo certbot --nginx -d ipn.fyi
```

Restart Nginx:

```bash
sudo systemctl restart nginx
```

### 6. Start the API Server

For production, use PM2 or systemd:

```bash
npm install -g pm2
pm2 start server.js --name ipn-fyi
pm2 save
pm2 startup
```

Or create a systemd service:

```bash
sudo nano /etc/systemd/system/ipnfyi.service
```

```ini
[Unit]
Description=ipn.fyi DDNS API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ipn.fyi
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable ipnfyi
sudo systemctl start ipnfyi
```

## Usage

### Generate API Key

Generate an API key for a user:

```bash
node scripts/generate-api-key.js username
```

This will output:

```
API Key generated successfully!
─────────────────────────────────────────────────────────────────
User:    username
API Key: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
─────────────────────────────────────────────────────────────────
```

### Update DNS Record

#### Using curl (POST):

```bash
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "myserver",
    "ipv4": "1.2.3.4",
    "ipv6": "2001:db8::1"
  }'
```

#### Using curl (GET):

```bash
curl "https://ipn.fyi/api/update?key=YOUR_API_KEY&domain=myserver&ipv4=1.2.3.4"
```

#### Using the provided scripts:

**Bash client:**

```bash
# Configure
cat > ~/.ipnfyi.conf <<EOF
API_KEY=your_api_key_here
DOMAIN=myserver
EOF

# Run
./clients/update-ddns.sh
```

**Python client:**

```bash
# Configure
cat > ~/.ipnfyi.json <<EOF
{
  "api_key": "your_api_key_here",
  "domain": "myserver"
}
EOF

# Run
python3 clients/update-ddns.py
```

### Automated Updates (Linux)

Install the systemd timer for automatic updates every 15 minutes:

```bash
sudo cp clients/update-ddns.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/update-ddns.sh
sudo cp clients/ipnfyi-ddns.service /etc/systemd/system/
sudo cp clients/ipnfyi-ddns.timer /etc/systemd/system/
sudo systemctl enable ipnfyi-ddns.timer
sudo systemctl start ipnfyi-ddns.timer
```

### Automated Updates (macOS)

Create a launchd plist:

```bash
cat > ~/Library/LaunchAgents/com.ipnfyi.ddns.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ipnfyi.ddns</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/update-ddns.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.ipnfyi.ddns.plist
```

## API Documentation

### Authentication

All API requests require authentication via API key in one of two ways:

1. Header: `X-API-Key: YOUR_API_KEY`
2. Query parameter: `?key=YOUR_API_KEY`

### Endpoints

#### POST /api/update

Update DNS record with new IP address(es).

**Request body:**

```json
{
  "domain": "subdomain",
  "ipv4": "1.2.3.4",
  "ipv6": "2001:db8::1",
  "comments": "Optional comment",
  "ref_num": "Optional reference"
}
```

**Response:**

```json
{
  "success": true,
  "domain": "subdomain.n.ipn.fyi",
  "ipv4": "1.2.3.4",
  "ipv6": "2001:db8::1",
  "updated_at": 1234567890
}
```

#### GET /api/records

Get all DNS records for authenticated user.

**Query parameters:**
- `domain` (optional): Filter by specific domain

**Response:**

```json
{
  "records": [
    {
      "domain": "subdomain",
      "current_ipv4": "1.2.3.4",
      "current_ipv6": "2001:db8::1",
      "updated_at": 1234567890,
      "version": 5
    }
  ]
}
```

#### GET /api/history

Get IP change history.

**Query parameters:**
- `domain` (optional): Filter by specific domain
- `limit` (optional): Number of records to return (default: 50, max: 250)

**Response:**

```json
{
  "history": [
    {
      "domain": "subdomain",
      "ipv4": "1.2.3.4",
      "ipv6": "2001:db8::1",
      "changed_at": 1234567890,
      "change_type": "both_change"
    }
  ]
}
```

#### DELETE /api/record/:domain

Delete a DNS record.

**Response:**

```json
{
  "success": true,
  "deleted": "subdomain"
}
```

## Database Schema

### dns_records

Main table storing current DNS records:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| afterdark_login | VARCHAR(255) | User identifier |
| domain | VARCHAR(255) | Subdomain name |
| current_ipv4 | INET | Current IPv4 address |
| last_ipv4 | INET | Previous IPv4 address |
| current_ipv6 | INET | Current IPv6 address |
| last_ipv6 | INET | Previous IPv6 address |
| updated_at | BIGINT | Unix timestamp |
| comments | TEXT | Optional comments |
| ref_num | VARCHAR(100) | Optional reference number |
| version | INTEGER | Update counter |

### ip_history

IP change history (last 250 entries per user):

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| afterdark_login | VARCHAR(255) | User identifier |
| domain | VARCHAR(255) | Subdomain name |
| ipv4 | INET | IPv4 at time of change |
| ipv6 | INET | IPv6 at time of change |
| changed_at | BIGINT | Unix timestamp |
| change_type | VARCHAR(20) | Type of change |

### api_keys

API authentication keys:

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| afterdark_login | VARCHAR(255) | User identifier |
| api_key | VARCHAR(64) | API key (64 hex chars) |
| created_at | TIMESTAMP | Creation time |
| last_used | TIMESTAMP | Last usage time |
| is_active | BOOLEAN | Active status |

## Security

- API keys are 256-bit random hex strings
- All connections should use HTTPS
- Rate limiting is enforced (100 requests per 15 minutes per IP)
- SQL injection protection via parameterized queries
- Input validation on all endpoints
- History automatically pruned to 250 entries per user

## Maintenance

### Backup Database

```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Monitor Logs

```bash
# API logs (if using PM2)
pm2 logs ipn-fyi

# Nginx logs
tail -f /var/log/nginx/ipn.fyi.access.log
tail -f /var/log/nginx/ipn.fyi.error.log

# NSD logs
tail -f /var/log/nsd.log
```

### Check NSD Status

```bash
sudo nsd-control status
sudo nsd-control stats
```

## Troubleshooting

### Zone file not updating

Check NSD permissions:

```bash
sudo chown nsd:nsd /etc/nsd/zones/n.ipn.fyi.zone
sudo chmod 644 /etc/nsd/zones/n.ipn.fyi.zone
```

Test zone file generation:

```bash
node -e "require('./server.js')"
```

### API not responding

Check if service is running:

```bash
pm2 status
# or
sudo systemctl status ipnfyi
```

Check logs for errors:

```bash
pm2 logs ipn-fyi --lines 100
```

### Database connection issues

Test connection:

```bash
psql $DATABASE_URL -c "SELECT 1"
```

Check if SSL is required and properly configured in your connection string.

## License

MIT

## Support

For support, visit [DNS Science](https://www.dnsscience.io) or contact your administrator.

## Contributing

Contributions are welcome! Please submit pull requests or issues on the project repository.
