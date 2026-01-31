# ipn.fyi DNS Client

Python client for updating ipn.fyi dynamic DNS records.

## Quick Start

### For dsc.n.ipn.fyi → 132.145.179.230

```bash
# Copy the config file
cp ipn_client_config_dsc.json ~/.ipnfyi/config.json

# Or create directory first
mkdir -p ~/.ipnfyi
cp ipn_client_config_dsc.json ~/.ipnfyi/config.json

# Run the client
python3 ipn_client.py
```

## Configuration

The client looks for config files in these locations (in order):
1. `~/.ipnfyi/config.json`
2. `~/.ipnfyi.json`
3. `./.ipnfyi.json`
4. `./config.json`

### Config File Format

```json
{
  "api_url": "https://ipn.fyi/api/update",
  "api_key": "your-api-key-here",
  "domain": "yourdomain",
  "auto_detect_ipv4": true,
  "auto_detect_ipv6": false,
  "ipv4": null,
  "ipv6": null
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `api_url` | string | API endpoint (default: https://ipn.fyi/api/update) |
| `api_key` | string | Your API key (required) |
| `domain` | string | Subdomain name (e.g., "dsc" for dsc.n.ipn.fyi) |
| `auto_detect_ipv4` | boolean | Auto-detect IPv4 address |
| `auto_detect_ipv6` | boolean | Auto-detect IPv6 address |
| `ipv4` | string/null | Static IPv4 address (overrides auto-detect) |
| `ipv6` | string/null | Static IPv6 address (overrides auto-detect) |

## Usage

### Initialize Configuration

```bash
python3 ipn_client.py --init
```

This will prompt you for:
- API Key
- Domain name
- API URL (optional)
- Auto-detect preference

### Update DNS

```bash
# Auto-detect IP and update
python3 ipn_client.py

# Use specific IPv4
python3 ipn_client.py --ipv4 1.2.3.4

# Use specific IPv6
python3 ipn_client.py --ipv6 2001:db8::1

# Both IPv4 and IPv6
python3 ipn_client.py --ipv4 1.2.3.4 --ipv6 2001:db8::1

# Override domain
python3 ipn_client.py --domain mydomain

# Use specific config file
python3 ipn_client.py --config /path/to/config.json
```

### Show Configuration

```bash
python3 ipn_client.py --show-config
```

## Default API Keys

From `seed-data.sql`:

| User | Domain | API Key |
|------|--------|---------|
| dsc | dsc.n.ipn.fyi | `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2` |
| rams | rams.n.ipn.fyi | `b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3` |
| david | david.n.ipn.fyi | `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4` |
| admin | *.n.ipn.fyi | `d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5` |

⚠️ **Change these keys in production!**

## Automated Updates

### Linux (systemd timer)

```bash
# Copy client to system location
sudo cp ipn_client.py /usr/local/bin/ipn-client
sudo chmod +x /usr/local/bin/ipn-client

# Copy config
mkdir -p ~/.ipnfyi
cp ipn_client_config_dsc.json ~/.ipnfyi/config.json

# Create systemd service
cat > ~/.config/systemd/user/ipn-client.service <<EOF
[Unit]
Description=ipn.fyi DNS Client
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/ipn-client
EOF

# Create systemd timer
cat > ~/.config/systemd/user/ipn-client.timer <<EOF
[Unit]
Description=ipn.fyi DNS Client Timer
Requires=ipn-client.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Unit=ipn-client.service

[Install]
WantedBy=timers.target
EOF

# Enable and start timer
systemctl --user enable ipn-client.timer
systemctl --user start ipn-client.timer

# Check status
systemctl --user status ipn-client.timer
```

### macOS (launchd)

```bash
# Copy client
sudo cp ipn_client.py /usr/local/bin/ipn-client
sudo chmod +x /usr/local/bin/ipn-client

# Copy config
mkdir -p ~/.ipnfyi
cp ipn_client_config_dsc.json ~/.ipnfyi/config.json

# Create launchd plist
cat > ~/Library/LaunchAgents/com.ipnfyi.client.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ipnfyi.client</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/ipn-client</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/ipn-client.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ipn-client.err</string>
</dict>
</plist>
EOF

# Load launchd job
launchctl load ~/Library/LaunchAgents/com.ipnfyi.client.plist

# Check status
launchctl list | grep ipnfyi
```

### Cron (any Unix system)

```bash
# Edit crontab
crontab -e

# Add line (runs every 15 minutes)
*/15 * * * * /usr/local/bin/ipn-client >> /tmp/ipn-client.log 2>&1
```

## Examples

### Example 1: dsc.n.ipn.fyi with static IP

```json
{
  "api_url": "https://ipn.fyi/api/update",
  "api_key": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "domain": "dsc",
  "auto_detect_ipv4": false,
  "auto_detect_ipv6": false,
  "ipv4": "132.145.179.230",
  "ipv6": null
}
```

```bash
python3 ipn_client.py
```

### Example 2: Auto-detect IP

```json
{
  "api_url": "https://ipn.fyi/api/update",
  "api_key": "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
  "domain": "rams",
  "auto_detect_ipv4": true,
  "auto_detect_ipv6": false,
  "ipv4": null,
  "ipv6": null
}
```

```bash
python3 ipn_client.py
```

Output:
```
ℹ Loaded config from: /Users/ryan/.ipnfyi/config.json
ℹ Detecting IPv4 address...
  IPv4: 203.0.113.42
ℹ Updating DNS record for rams.n.ipn.fyi...
✓ DNS updated successfully!
  Domain: rams.n.ipn.fyi
  IPv4: 203.0.113.42
```

### Example 3: Command-line override

```bash
# Override IP from command line
python3 ipn_client.py --ipv4 10.0.0.1

# Override domain
python3 ipn_client.py --domain myserver
```

## Testing

### Test with local API (development)

```json
{
  "api_url": "http://localhost:3000/api/update",
  "api_key": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
  "domain": "dsc",
  "auto_detect_ipv4": true,
  "auto_detect_ipv6": false
}
```

### Test API connectivity

```bash
# Using curl
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2" \
  -H "Content-Type: application/json" \
  -d '{"domain":"dsc","ipv4":"132.145.179.230"}'
```

Expected response:
```json
{
  "success": true,
  "domain": "dsc.n.ipn.fyi",
  "ipv4": "132.145.179.230",
  "ipv6": null,
  "updated_at": 1706745600
}
```

## Troubleshooting

### Config file not found

```
✗ Error: No config file found. Use --init to create one.
```

**Solution**: Run `python3 ipn_client.py --init` or copy a config file to one of the expected locations.

### Invalid API key

```
✗ Error: API Error: Invalid API key
```

**Solution**: Check your API key in the config file. Make sure it's correct.

### Permission denied (domain)

```
✗ Error: API Error: Permission denied
  You can only update dsc.n.ipn.fyi. To update rams.n.ipn.fyi, use an admin key.
```

**Solution**: Regular API keys can only update their own domain. Use the correct key for the domain, or use an admin key.

### Connection error

```
✗ Error: Connection error: [Errno 8] nodename nor servname provided, or not known
```

**Solution**: Check your internet connection and ensure the API URL is correct.

### No IP detected

```
✗ Error: No IP address provided or detected
```

**Solution**: Either set `ipv4` in config, or ensure `auto_detect_ipv4` is `true`.

## Requirements

- Python 3.6+
- No external dependencies (uses standard library only)

## Security

- Config file may contain sensitive API keys
- Recommended permissions: `chmod 600 ~/.ipnfyi/config.json`
- Store config files securely
- Don't commit config files to version control

## API Reference

See main `README.md` for full API documentation.

### Quick API Info

**Endpoint**: `https://ipn.fyi/api/update`

**Method**: POST

**Headers**:
- `X-API-Key`: Your API key
- `Content-Type`: application/json

**Body**:
```json
{
  "domain": "subdomain",
  "ipv4": "1.2.3.4",
  "ipv6": "2001:db8::1"
}
```

**Response**:
```json
{
  "success": true,
  "domain": "subdomain.n.ipn.fyi",
  "ipv4": "1.2.3.4",
  "ipv6": "2001:db8::1",
  "updated_at": 1706745600
}
```
