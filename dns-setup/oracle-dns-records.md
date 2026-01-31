# Oracle Cloud DNS Setup for ipn.fyi

## Overview

This guide will help you set up DNS records for ipn.fyi in Oracle Cloud DNS.

## Prerequisites

- Oracle Cloud account with DNS zone created for ipn.fyi
- Oracle Cloud instance running with a public IP address

## DNS Records to Create

### 1. Apex Records (ipn.fyi)

```
Type: A
Name: @
Value: <YOUR_SERVER_IP>
TTL: 300
```

### 2. WWW Subdomain

```
Type: A
Name: www
Value: <YOUR_SERVER_IP>
TTL: 300
```

Or use CNAME:
```
Type: CNAME
Name: www
Value: ipn.fyi.
TTL: 300
```

### 3. Nameserver for n.ipn.fyi (Dynamic DNS subdomain)

First, create an A record for the nameserver:

```
Type: A
Name: ns1
Value: <YOUR_SERVER_IP>
TTL: 300
```

Then delegate n.ipn.fyi to this nameserver:

```
Type: NS
Name: n
Value: ns1.ipn.fyi.
TTL: 300
```

### 4. Optional: IPv6 Support

If you have an IPv6 address:

```
Type: AAAA
Name: @
Value: <YOUR_SERVER_IPV6>
TTL: 300

Type: AAAA
Name: www
Value: <YOUR_SERVER_IPV6>
TTL: 300

Type: AAAA
Name: ns1
Value: <YOUR_SERVER_IPV6>
TTL: 300
```

## Complete DNS Zone File Example

```
$ORIGIN ipn.fyi.
$TTL 300

@       IN  SOA     ns1.ipn.fyi. admin.ipn.fyi. (
                    2024013101  ; Serial
                    3600        ; Refresh
                    1800        ; Retry
                    604800      ; Expire
                    300 )       ; Minimum TTL

; Nameservers
@       IN  NS      ns1.ipn.fyi.

; A Records
@       IN  A       <YOUR_SERVER_IP>
www     IN  A       <YOUR_SERVER_IP>
ns1     IN  A       <YOUR_SERVER_IP>

; Delegation for dynamic DNS subdomain
n       IN  NS      ns1.ipn.fyi.

; Optional: IPv6
; @       IN  AAAA    <YOUR_SERVER_IPV6>
; www     IN  AAAA    <YOUR_SERVER_IPV6>
; ns1     IN  AAAA    <YOUR_SERVER_IPV6>
```

## Setup Steps in Oracle Cloud Console

### Method 1: Using Oracle Cloud Console UI

1. Log in to Oracle Cloud Console
2. Navigate to **Networking** → **DNS Management** → **Zones**
3. Click **Create Zone**
   - Zone Type: Primary
   - Zone Name: `ipn.fyi`
   - Create in Compartment: (select your compartment)
4. Click **Create**
5. Once created, click on the zone name to manage records
6. Click **Add Record** for each record above:
   - Record Type: A, NS, AAAA, etc.
   - Name: @, www, ns1, n
   - TTL: 300
   - RDATA: (your IP or nameserver)

### Method 2: Using OCI CLI

See `oracle-dns-setup.sh` for automated setup script.

## Verification

After setting up DNS records, verify with:

```bash
# Check apex record
dig ipn.fyi

# Check www
dig www.ipn.fyi

# Check nameserver
dig ns1.ipn.fyi

# Check NS delegation
dig n.ipn.fyi NS

# Test from authoritative nameserver
dig @ns1.ipn.fyi test.n.ipn.fyi
```

## Nameserver Registration

Once DNS is configured, you need to register the Oracle Cloud nameservers with your domain registrar:

1. Log in to your domain registrar (where you bought ipn.fyi)
2. Find the nameserver settings
3. Update to Oracle Cloud DNS nameservers (shown in Oracle Cloud DNS console)
   - Example: `ns1.dns.oraclecloud.net`, `ns2.dns.oraclecloud.net`, etc.
4. Wait for DNS propagation (can take up to 48 hours, usually much faster)

## Notes

- The `n.ipn.fyi` subdomain is delegated to NSD running on your server
- NSD will handle all `*.n.ipn.fyi` subdomains for dynamic DNS
- Oracle Cloud DNS handles the main `ipn.fyi` domain
- Make sure your Oracle Cloud security list allows:
  - TCP/UDP port 53 (DNS)
  - TCP port 80 (HTTP)
  - TCP port 443 (HTTPS)
