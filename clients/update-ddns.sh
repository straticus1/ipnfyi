#!/bin/bash

# ipn.fyi Dynamic DNS Update Client
# Usage: ./update-ddns.sh [domain]

set -e

# Configuration - edit these values
API_KEY="${IPN_API_KEY:-}"
DOMAIN="${1:-}"
API_URL="${IPN_API_URL:-https://ipn.fyi/api/update}"
CONFIG_FILE="${HOME}/.ipnfyi.conf"

# Load configuration from file if exists
if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

# Check if API key is set
if [ -z "$API_KEY" ]; then
    echo "Error: API key not set."
    echo "Either set IPN_API_KEY environment variable or create ~/.ipnfyi.conf with:"
    echo "API_KEY=your_api_key_here"
    echo "DOMAIN=your_domain_here"
    exit 1
fi

# Check if domain is set
if [ -z "$DOMAIN" ]; then
    echo "Error: Domain not set."
    echo "Either pass domain as argument or set DOMAIN in ~/.ipnfyi.conf"
    exit 1
fi

# Function to get public IPv4
get_ipv4() {
    # Try multiple services for reliability
    local ip=""
    ip=$(curl -s -4 https://api.ipify.org 2>/dev/null) || \
    ip=$(curl -s -4 https://icanhazip.com 2>/dev/null) || \
    ip=$(curl -s -4 https://ifconfig.me 2>/dev/null)
    echo "$ip"
}

# Function to get public IPv6
get_ipv6() {
    local ip=""
    ip=$(curl -s -6 https://api6.ipify.org 2>/dev/null) || \
    ip=$(curl -s -6 https://icanhazip.com 2>/dev/null) || \
    ip=$(curl -s -6 https://ifconfig.me 2>/dev/null)
    echo "$ip"
}

# Get current IPs
echo "Detecting IP addresses..."
IPV4=$(get_ipv4)
IPV6=$(get_ipv6)

if [ -z "$IPV4" ] && [ -z "$IPV6" ]; then
    echo "Error: Could not detect any IP address"
    exit 1
fi

# Display detected IPs
[ -n "$IPV4" ] && echo "IPv4: $IPV4"
[ -n "$IPV6" ] && echo "IPv6: $IPV6"

# Build JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
    "domain": "$DOMAIN",
    "ipv4": ${IPV4:+\"$IPV4\"},
    "ipv6": ${IPV6:+\"$IPV6\"}
}
EOF
)

# Update DNS
echo "Updating DNS record for $DOMAIN.n.ipn.fyi..."
RESPONSE=$(curl -s -X POST "$API_URL" \
    -H "X-API-Key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD")

# Check response
if echo "$RESPONSE" | grep -q '"success":true'; then
    echo "Success! DNS updated."
    echo "$RESPONSE" | grep -o '"domain":"[^"]*"' | cut -d'"' -f4
else
    echo "Error updating DNS:"
    echo "$RESPONSE"
    exit 1
fi
