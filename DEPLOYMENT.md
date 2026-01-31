# Deployment Checklist

Follow these steps to deploy ipn.fyi on Oracle Cloud (or any Linux server).

## Pre-requisites

- [ ] Oracle Cloud instance (or any Linux VPS)
- [ ] Domain `ipn.fyi` pointing to server IP
- [ ] Subdomain `n.ipn.fyi` NS records pointing to `ipn.fyi`
- [ ] Neon PostgreSQL database created
- [ ] Root/sudo access to server

## Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y nginx nsd git build-essential curl

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version
npm --version
nsd -v
nginx -v
```

## Step 2: Clone Repository

```bash
# Create directory
sudo mkdir -p /opt/ipn.fyi
sudo chown $USER:$USER /opt/ipn.fyi

# Clone or copy files
cd /opt/ipn.fyi
# (upload files via scp, git, or other means)
```

## Step 3: Database Setup

```bash
# Set database URL
export DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require"

# Install psql client
sudo apt install -y postgresql-client

# Run schema
psql $DATABASE_URL -f schema.sql

# Verify tables created
psql $DATABASE_URL -c "\dt"
```

## Step 4: Application Setup

```bash
cd /opt/ipn.fyi

# Install dependencies
npm install --production

# Create environment file
cp .env.example .env
nano .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
PORT=3000
NODE_ENV=production
NSD_ZONE_DIR=/etc/nsd/zones
NSD_ZONE_FILE=/etc/nsd/zones/n.ipn.fyi.zone
NSD_CONTROL_PATH=/usr/sbin/nsd-control
BASE_DOMAIN=n.ipn.fyi
MAIN_DOMAIN=ipn.fyi
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Step 5: NSD Configuration

```bash
# Setup NSD control certificates
sudo nsd-control-setup

# Create zones directory
sudo mkdir -p /etc/nsd/zones
sudo chown nsd:nsd /etc/nsd/zones

# Copy configuration
sudo cp nsd.conf.example /etc/nsd/conf.d/ipn.fyi.conf

# Edit if needed
sudo nano /etc/nsd/conf.d/ipn.fyi.conf

# Test configuration
sudo nsd-checkconf /etc/nsd/nsd.conf

# Enable and start NSD
sudo systemctl enable nsd
sudo systemctl restart nsd
sudo systemctl status nsd

# Verify NSD control works
sudo nsd-control status
```

## Step 6: Nginx Configuration

```bash
# Copy public files
sudo mkdir -p /var/www/ipn.fyi
sudo cp -r public /var/www/ipn.fyi/
sudo chown -R www-data:www-data /var/www/ipn.fyi

# Copy nginx config
sudo cp nginx.conf.example /etc/nginx/sites-available/ipn.fyi

# Edit paths if needed
sudo nano /etc/nginx/sites-available/ipn.fyi

# Enable site
sudo ln -s /etc/nginx/sites-available/ipn.fyi /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Get SSL certificate
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ipn.fyi

# Reload nginx
sudo systemctl reload nginx
```

## Step 7: API Service Setup

```bash
# Install PM2
sudo npm install -g pm2

# Start application
cd /opt/ipn.fyi
pm2 start server.js --name ipn-fyi

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs

# Check status
pm2 status
pm2 logs ipn-fyi
```

Alternative: Systemd service

```bash
# Create service file
sudo nano /etc/systemd/system/ipnfyi.service
```

Paste:

```ini
[Unit]
Description=ipn.fyi DDNS API
After=network.target postgresql.service

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

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable ipnfyi
sudo systemctl start ipnfyi
sudo systemctl status ipnfyi
```

## Step 8: Generate First API Key

```bash
cd /opt/ipn.fyi
node scripts/generate-api-key.js testuser
```

Save the generated API key securely.

## Step 9: Test the Service

```bash
# Test health endpoint
curl https://ipn.fyi/api/health

# Test update (replace with your API key)
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"test","ipv4":"1.2.3.4"}'

# Check zone file was created
sudo cat /etc/nsd/zones/n.ipn.fyi.zone

# Test DNS resolution (may take a few minutes)
dig test.n.ipn.fyi @localhost
```

## Step 10: Firewall Configuration

```bash
# Oracle Cloud: Configure security list in OCI console
# Allow:
# - TCP 80 (HTTP)
# - TCP 443 (HTTPS)
# - UDP 53 (DNS)
# - TCP 53 (DNS)

# UFW (if using)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 53/udp
sudo ufw allow 53/tcp
sudo ufw enable
```

## Step 11: DNS Configuration

In your DNS provider (e.g., Cloudflare, Route53):

1. Point `ipn.fyi` A/AAAA records to your server IP
2. Add NS records for `n.ipn.fyi`:
   ```
   n.ipn.fyi. NS ipn.fyi.
   ```
3. Wait for DNS propagation

## Step 12: Monitoring Setup

```bash
# Setup log rotation for nginx
sudo nano /etc/logrotate.d/ipn-fyi
```

Add:

```
/var/log/nginx/ipn.fyi.*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

## Step 13: Backups

```bash
# Create backup script
sudo nano /usr/local/bin/backup-ipnfyi.sh
```

Add:

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backup/ipnfyi"
mkdir -p $BACKUP_DIR

# Backup database
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep last 7 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete
```

```bash
sudo chmod +x /usr/local/bin/backup-ipnfyi.sh

# Add to crontab
sudo crontab -e
```

Add:

```
0 2 * * * /usr/local/bin/backup-ipnfyi.sh
```

## Step 14: Final Verification

- [ ] Visit https://ipn.fyi - should show landing page
- [ ] API health check returns OK
- [ ] Can create DNS records via API
- [ ] DNS resolution works: `dig test.n.ipn.fyi`
- [ ] SSL certificate is valid
- [ ] Logs are being written
- [ ] Services start on reboot

## Maintenance Commands

```bash
# View API logs
pm2 logs ipn-fyi
# or
sudo journalctl -u ipnfyi -f

# View nginx logs
sudo tail -f /var/log/nginx/ipn.fyi.access.log
sudo tail -f /var/log/nginx/ipn.fyi.error.log

# View NSD logs
sudo journalctl -u nsd -f

# Restart services
pm2 restart ipn-fyi
# or
sudo systemctl restart ipnfyi
sudo systemctl restart nginx
sudo systemctl restart nsd

# Check NSD zone
sudo nsd-control status
sudo cat /etc/nsd/zones/n.ipn.fyi.zone
```

## Troubleshooting

### API won't start

```bash
# Check logs
pm2 logs ipn-fyi --lines 50

# Check database connection
node -e "const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});pool.query('SELECT 1').then(()=>console.log('OK')).catch(e=>console.error(e))"
```

### NSD won't reload

```bash
# Check permissions
ls -la /etc/nsd/zones/

# Grant permissions to API user
sudo usermod -a -G nsd www-data

# Allow sudo without password for nsd-control
sudo visudo
```

Add:

```
www-data ALL=(ALL) NOPASSWD: /usr/sbin/nsd-control
```

### DNS not resolving

```bash
# Check if NSD is listening
sudo netstat -tulpn | grep :53

# Test locally
dig @localhost test.n.ipn.fyi

# Check zone file
sudo cat /etc/nsd/zones/n.ipn.fyi.zone

# Reload NSD
sudo nsd-control reload n.ipn.fyi
```

## Security Hardening

```bash
# Disable root SSH
sudo nano /etc/ssh/sshd_config
# Set: PermitRootLogin no

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades

# Install fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Complete!

Your ipn.fyi Dynamic DNS service should now be fully operational.
