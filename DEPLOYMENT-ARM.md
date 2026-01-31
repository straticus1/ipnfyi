# Oracle Cloud Free Tier ARM Deployment Guide

Deploy ipn.fyi on Oracle Cloud's Free Tier Ampere A1 ARM instance.

## Oracle Cloud Free Tier ARM Specs

- **CPU**: Up to 4 ARM-based Ampere cores
- **RAM**: Up to 24 GB
- **Storage**: Up to 200 GB
- **Network**: Up to 10 TB/month egress
- **Cost**: FREE (Always Free tier)

## Available Regions for ARM

Free Tier ARM instances (Ampere A1) are available in these regions:
- `ap-sydney-1` (Sydney, Australia)
- `ap-melbourne-1` (Melbourne, Australia)
- `ap-tokyo-1` (Tokyo, Japan)
- `ap-osaka-1` (Osaka, Japan)
- `ap-mumbai-1` (Mumbai, India)
- `ap-seoul-1` (Seoul, South Korea)
- `ap-singapore-1` (Singapore)
- `ca-toronto-1` (Toronto, Canada)
- `ca-montreal-1` (Montreal, Canada)
- `eu-frankfurt-1` (Frankfurt, Germany)
- `eu-amsterdam-1` (Amsterdam, Netherlands)
- `eu-zurich-1` (Zurich, Switzerland)
- `uk-london-1` (London, UK)
- `us-phoenix-1` (Phoenix, AZ, USA)
- `us-sanjose-1` (San Jose, CA, USA)
- `sa-saopaulo-1` (Sao Paulo, Brazil)

**Note**: `us-ashburn-1` does NOT have free ARM instances. Use a different region or deploy to an AMD container server.

## Prerequisites

1. Oracle Cloud account (free tier)
2. Domain `ipn.fyi` registered
3. Neon PostgreSQL database (free tier available)

## Step 1: Create ARM Instance

### Via Oracle Cloud Console

1. Log in to Oracle Cloud Console
2. Navigate to **Compute** → **Instances**
3. Click **Create Instance**

**Configuration:**
- **Name**: `ipnfyi-ddns`
- **Compartment**: Select your compartment
- **Image**: Ubuntu 22.04 (ARM64)
- **Shape**: `VM.Standard.A1.Flex`
  - OCPUs: 2 (or up to 4 if available)
  - Memory: 12 GB (or up to 24 GB)
- **Networking**:
  - VCN: Create new or select existing
  - Subnet: Public subnet
  - Public IP: Assign a public IPv4 address
- **SSH Keys**: Add your SSH public key

4. Click **Create**
5. Wait for instance to provision (2-5 minutes)
6. Note the **Public IP address**

### Security List Configuration

Add ingress rules for:

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | 0.0.0.0/0 | SSH |
| 53 | TCP | 0.0.0.0/0 | DNS |
| 53 | UDP | 0.0.0.0/0 | DNS |
| 80 | TCP | 0.0.0.0/0 | HTTP |
| 443 | TCP | 0.0.0.0/0 | HTTPS |

## Step 2: Setup DNS Records

Once you have the instance IP, set up DNS:

```bash
cd dns-setup

# Set your instance IP
export SERVER_IP="your.instance.ip.here"
export OCI_COMPARTMENT_ID="your-compartment-ocid"

# Run DNS setup
bash oracle-dns-setup.sh $SERVER_IP
```

Or use Terraform (see `dns-setup/terraform/`)

## Step 3: Connect to Instance

```bash
ssh ubuntu@<your-instance-ip>
```

## Step 4: Install Docker (ARM Compatible)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker ubuntu

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Logout and login again for group changes
exit
```

Reconnect via SSH:
```bash
ssh ubuntu@<your-instance-ip>
```

Verify Docker:
```bash
docker --version
docker info | grep Architecture
# Should show: Architecture: aarch64
```

## Step 5: Install Docker Compose

```bash
# Install Docker Compose
sudo apt install -y docker-compose-plugin

# Verify
docker compose version
```

## Step 6: Deploy Application

### Clone Repository

```bash
cd ~
git clone https://github.com/straticus1/ipnfyi.git
cd ipnfyi
```

### Configure Environment

```bash
cp .env.example .env
nano .env
```

Update with your values:
```env
DATABASE_URL=postgresql://user:pass@host.neon.tech/dbname?sslmode=require
PORT=3000
NODE_ENV=production
NSD_ZONE_DIR=/etc/nsd/zones
NSD_ZONE_FILE=/etc/nsd/zones/n.ipn.fyi.zone
NSD_CONTROL_PATH=/usr/sbin/nsd-control
BASE_DOMAIN=n.ipn.fyi
MAIN_DOMAIN=ipn.fyi
```

### Initialize Database

```bash
# Install psql client
sudo apt install -y postgresql-client

# Run schema
psql $DATABASE_URL -f schema.sql

# Load default API keys
psql $DATABASE_URL -f seed-data.sql
```

### Build and Run with Docker

#### Option A: Single Container (Recommended for ARM)

```bash
# Build for ARM64
docker build -f Dockerfile.alpine -t ipnfyi:latest .

# Run container
docker run -d \
  --name ipnfyi \
  --restart unless-stopped \
  -p 80:3000 \
  -p 53:53/udp \
  -p 53:53/tcp \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  ipnfyi:latest

# Check logs
docker logs -f ipnfyi
```

#### Option B: Docker Compose

```bash
# Create .env file for compose
cat > .env <<EOF
DATABASE_URL=your-database-url-here
EOF

# Start services
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

## Step 7: Install and Configure Nginx

```bash
# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Copy nginx config
sudo cp nginx.conf.example /etc/nginx/sites-available/ipn.fyi

# Edit config (update paths if needed)
sudo nano /etc/nginx/sites-available/ipn.fyi

# Enable site
sudo ln -s /etc/nginx/sites-available/ipn.fyi /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Get SSL certificate
sudo certbot --nginx -d ipn.fyi -d www.ipn.fyi

# Reload nginx
sudo systemctl reload nginx
```

## Step 8: Configure Firewall (UFW)

```bash
# Enable firewall
sudo ufw allow 22/tcp
sudo ufw allow 53/tcp
sudo ufw allow 53/udp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# Check status
sudo ufw status
```

## Step 9: Verify Deployment

```bash
# Check API health
curl http://localhost:3000/api/health

# Check from external
curl https://ipn.fyi/api/health

# Test DNS
dig @localhost test.n.ipn.fyi
dig test.n.ipn.fyi

# Test dynamic DNS update
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2" \
  -H "Content-Type: application/json" \
  -d '{"domain":"dsc","ipv4":"1.2.3.4"}'

# Verify DNS record
dig dsc.n.ipn.fyi
```

## Step 10: Management

### Using CLI Tool

```bash
# Install CLI globally in container
docker exec -it ipnfyi npm link

# Or run directly
docker exec -it ipnfyi node ipnfyi-cli.js help

# List keys
docker exec -it ipnfyi node ipnfyi-cli.js list-keys

# List domains
docker exec -it ipnfyi node ipnfyi-cli.js list-domains

# Create new key
docker exec -it ipnfyi node ipnfyi-cli.js create-key newuser

# View stats
docker exec -it ipnfyi node ipnfyi-cli.js stats
```

### Docker Management

```bash
# View logs
docker logs -f ipnfyi

# Restart container
docker restart ipnfyi

# Stop container
docker stop ipnfyi

# Start container
docker start ipnfyi

# Update application
cd ~/ipnfyi
git pull
docker build -f Dockerfile.alpine -t ipnfyi:latest .
docker stop ipnfyi
docker rm ipnfyi
# Re-run the docker run command from Step 6
```

## Performance Tuning for ARM

### Optimize Node.js for ARM

Already optimized in the container, but if running natively:

```bash
# Use Node.js 20+ (has ARM64 optimizations)
# Set memory limits
export NODE_OPTIONS="--max-old-space-size=4096"
```

### Monitor Resources

```bash
# Check container stats
docker stats ipnfyi

# Check system resources
htop
free -h
df -h
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker logs ipnfyi

# Check if ports are in use
sudo netstat -tulpn | grep :53
sudo netstat -tulpn | grep :3000
```

### DNS not resolving

```bash
# Check if NSD is running in container
docker exec -it ipnfyi ps aux | grep nsd

# Check zone file
docker exec -it ipnfyi cat /etc/nsd/zones/n.ipn.fyi.zone

# Test directly
docker exec -it ipnfyi nsd-control status
```

### Out of Memory

```bash
# Check memory usage
free -h

# Increase Docker memory limit
docker update --memory="2g" ipnfyi
```

### ARM Build Fails

```bash
# Ensure you're using ARM-compatible base images
# node:20-alpine supports ARM64 natively

# Check architecture
uname -m
# Should show: aarch64

docker info | grep Architecture
# Should show: Architecture: aarch64
```

## Backup and Recovery

### Backup Script

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"

mkdir -p $BACKUP_DIR

# Backup database
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Backup config
tar -czf $BACKUP_DIR/config_$DATE.tar.gz ~/ipnfyi/.env

# Keep last 7 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete
find $BACKUP_DIR -name "config_*.tar.gz" -mtime +7 -delete
```

Add to crontab:
```bash
crontab -e
```

Add:
```
0 2 * * * /home/ubuntu/backup.sh
```

## Cost Estimation

### Oracle Cloud Free Tier
- **Compute**: $0 (Always Free)
- **Storage**: $0 (Always Free - up to 200GB)
- **Network**: $0 (10 TB/month egress)

### Neon PostgreSQL
- **Free Tier**: 3 GB storage, 1 compute unit
- **Cost**: $0

### Total Monthly Cost: **$0**

## Scaling Considerations

Free Tier ARM instance can handle:
- **~1000 DNS updates/day**
- **~10,000 DNS queries/day**
- **~100 concurrent users**

For higher load, consider:
- Multiple ARM instances with load balancer
- Upgrade to paid instance with more cores
- Use caching (Redis) for frequently accessed records

## Next Steps

1. Set up monitoring (Prometheus + Grafana)
2. Configure automated backups
3. Set up log rotation
4. Configure fail2ban for security
5. Set up uptime monitoring

## Support

- Documentation: See `README.md`
- Issues: GitHub repository
- DNS Science: https://www.dnsscience.io
