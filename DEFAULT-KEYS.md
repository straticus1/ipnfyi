# Default API Keys

**IMPORTANT**: These are the default API keys created during initial setup. Keep these secure and rotate them in production.

## Standard User Keys

### dsc.n.ipn.fyi
- **User**: `dsc`
- **API Key**: `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2`
- **Permissions**: Can only update `dsc` subdomain

**Example usage:**
```bash
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2" \
  -H "Content-Type: application/json" \
  -d '{"domain":"dsc","ipv4":"1.2.3.4"}'
```

### rams.n.ipn.fyi
- **User**: `rams`
- **API Key**: `b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3`
- **Permissions**: Can only update `rams` subdomain

**Example usage:**
```bash
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3" \
  -H "Content-Type: application/json" \
  -d '{"domain":"rams","ipv4":"1.2.3.4"}'
```

### david.n.ipn.fyi
- **User**: `david`
- **API Key**: `c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4`
- **Permissions**: Can only update `david` subdomain

**Example usage:**
```bash
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4" \
  -H "Content-Type: application/json" \
  -d '{"domain":"david","ipv4":"1.2.3.4"}'
```

## Admin Key

### admin (Wildcard Access)
- **User**: `admin`
- **API Key**: `d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5`
- **Permissions**: Can create/update ANY subdomain (e.g., `anything.n.ipn.fyi`)
- **Admin**: Yes

**Example usage (can use any domain name):**
```bash
# Create server1.n.ipn.fyi
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5" \
  -H "Content-Type: application/json" \
  -d '{"domain":"server1","ipv4":"1.2.3.4"}'

# Create anything.n.ipn.fyi
curl -X POST https://ipn.fyi/api/update \
  -H "X-API-Key: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5" \
  -H "Content-Type: application/json" \
  -d '{"domain":"anything","ipv4":"5.6.7.8"}'
```

## Security Notes

1. **Change these keys in production**: Generate new keys for production use
2. **Store securely**: Never commit these keys to public repositories
3. **Rotate regularly**: Change API keys periodically
4. **Admin key**: Protect the admin key especially carefully as it has wildcard access

## Loading Default Keys

To load these keys into your database:

```bash
psql $DATABASE_URL -f seed-data.sql
```

## Generating New Keys

To generate a new API key for a user:

```bash
node scripts/generate-api-key.js username
```

For admin keys, manually insert with `is_admin = true` or modify the script.
