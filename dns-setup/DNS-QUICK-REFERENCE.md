# DNS Quick Reference for ipn.fyi

## DNS Records Summary

| Type | Name | Value | TTL | Purpose |
|------|------|-------|-----|---------|
| A | ipn.fyi | `<SERVER_IP>` | 300 | Main website |
| A | www.ipn.fyi | `<SERVER_IP>` | 300 | WWW subdomain |
| A | ns1.ipn.fyi | `<SERVER_IP>` | 300 | Nameserver for NSD |
| NS | n.ipn.fyi | ns1.ipn.fyi. | 300 | Delegate to NSD for dynamic DNS |
| AAAA | ipn.fyi | `<SERVER_IPV6>` | 300 | IPv6 (optional) |
| AAAA | www.ipn.fyi | `<SERVER_IPV6>` | 300 | IPv6 (optional) |
| AAAA | ns1.ipn.fyi | `<SERVER_IPV6>` | 300 | IPv6 (optional) |

## Setup Methods

### Method 1: OCI CLI Script (Fastest)

```bash
cd dns-setup

# Get your server IP
SERVER_IP="your.server.ip.here"

# Run the setup script
bash oracle-dns-setup.sh $SERVER_IP

# Follow the instructions to update your registrar
```

### Method 2: Terraform (Infrastructure as Code)

```bash
cd dns-setup/terraform

# Configure
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Edit with your values

# Deploy
terraform init
terraform plan
terraform apply

# Get nameservers
terraform output nameservers
```

### Method 3: Manual (Oracle Cloud Console)

See `oracle-dns-records.md` for step-by-step UI instructions.

## How It Works

```
User Query: dsc.n.ipn.fyi
         ↓
    DNS Resolver
         ↓
  Asks: Who handles ipn.fyi?
         ↓
Oracle Cloud DNS responds: "Here are my nameservers"
         ↓
  Resolver queries Oracle Cloud DNS
         ↓
  Asks: What's dsc.n.ipn.fyi?
         ↓
Oracle Cloud DNS: "n.ipn.fyi is delegated to ns1.ipn.fyi"
         ↓
  Resolver queries ns1.ipn.fyi (your NSD server)
         ↓
  NSD responds with: dsc.n.ipn.fyi → 1.2.3.4
         ↓
    User gets IP address
```

## DNS Delegation Explained

**Oracle Cloud DNS handles:**
- `ipn.fyi` (main domain)
- `www.ipn.fyi` (website)
- `ns1.ipn.fyi` (nameserver)

**NS Delegation** (`n.ipn.fyi NS ns1.ipn.fyi.`):
- Tells DNS resolvers: "For anything under `n.ipn.fyi`, ask `ns1.ipn.fyi`"

**NSD handles** (running on ns1.ipn.fyi):
- `dsc.n.ipn.fyi`
- `rams.n.ipn.fyi`
- `david.n.ipn.fyi`
- `anything.n.ipn.fyi` (any subdomain)

## After DNS Setup

1. **Update Registrar** with Oracle Cloud nameservers
2. **Wait for propagation** (1-48 hours)
3. **Verify DNS works:**
   ```bash
   dig ipn.fyi
   dig www.ipn.fyi
   dig ns1.ipn.fyi
   dig n.ipn.fyi NS
   ```
4. **Deploy the application** to the server
5. **Start NSD** to handle dynamic DNS
6. **Test dynamic DNS:**
   ```bash
   curl -X POST https://ipn.fyi/api/update \
     -H "X-API-Key: YOUR_KEY" \
     -d '{"domain":"test","ipv4":"1.2.3.4"}'

   dig test.n.ipn.fyi
   ```

## Verification Commands

```bash
# Check if DNS is working
dig ipn.fyi +short
dig www.ipn.fyi +short
dig ns1.ipn.fyi +short

# Check NS delegation
dig n.ipn.fyi NS +short

# Test NSD directly (after deployment)
dig @ns1.ipn.fyi test.n.ipn.fyi

# Trace full DNS resolution path
dig +trace ipn.fyi
dig +trace dsc.n.ipn.fyi
```

## Common Issues

### "SERVFAIL" or "NXDOMAIN"
- DNS not propagated yet, wait longer
- Nameservers not updated at registrar
- Check: `dig +trace ipn.fyi`

### "Connection timed out"
- Firewall blocking port 53
- NSD not running
- Check: `sudo netstat -tulpn | grep :53`

### n.ipn.fyi delegation not working
- NS record not created properly
- NSD not configured correctly
- Check: `dig n.ipn.fyi NS`

## Firewall Rules Needed

Allow these ports on your Oracle Cloud instance:

```bash
# DNS
TCP/UDP 53

# HTTP/HTTPS
TCP 80
TCP 443
```

Update security list in Oracle Cloud:
1. Networking → Virtual Cloud Networks
2. Select your VCN
3. Security Lists → Default Security List
4. Add Ingress Rules for ports above

## Next Steps After DNS

1. Deploy ipn.fyi application (see `DEPLOYMENT.md`)
2. Configure NSD (see `nsd.conf.example`)
3. Start the API server
4. Generate API keys for users
5. Test dynamic DNS updates
