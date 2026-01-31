#!/bin/bash

# Oracle Cloud DNS Setup Script for ipn.fyi
# Prerequisites:
# - OCI CLI installed and configured
# - Domain ipn.fyi registered
# - Oracle Cloud instance created with public IP

set -e

# Configuration - UPDATE THESE VALUES
SERVER_IP="${1:-}"
SERVER_IPV6="${2:-}"
COMPARTMENT_ID="${OCI_COMPARTMENT_ID:-}"
ZONE_NAME="ipn.fyi"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check prerequisites
if [ -z "$SERVER_IP" ]; then
    error "Server IP address required. Usage: $0 <server-ip> [server-ipv6]"
fi

if [ -z "$COMPARTMENT_ID" ]; then
    error "OCI_COMPARTMENT_ID environment variable not set"
fi

# Check if OCI CLI is installed
if ! command -v oci &> /dev/null; then
    error "OCI CLI is not installed. Install from: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/cliinstall.htm"
fi

info "Setting up DNS for $ZONE_NAME with IP: $SERVER_IP"

# Check if zone exists
info "Checking if DNS zone exists..."
ZONE_ID=$(oci dns zone get --zone-name-or-id "$ZONE_NAME" --compartment-id "$COMPARTMENT_ID" 2>/dev/null | jq -r '.data.id' || echo "")

if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" == "null" ]; then
    info "Creating DNS zone: $ZONE_NAME"

    ZONE_ID=$(oci dns zone create \
        --compartment-id "$COMPARTMENT_ID" \
        --name "$ZONE_NAME" \
        --zone-type PRIMARY \
        --wait-for-state ACTIVE \
        2>/dev/null | jq -r '.data.id')

    if [ -z "$ZONE_ID" ] || [ "$ZONE_ID" == "null" ]; then
        error "Failed to create DNS zone"
    fi

    success "DNS zone created: $ZONE_ID"
else
    success "DNS zone already exists: $ZONE_ID"
fi

# Function to add or update DNS record
add_record() {
    local record_type=$1
    local domain=$2
    local rdata=$3
    local ttl=${4:-300}

    info "Adding $record_type record: $domain -> $rdata"

    # Remove existing record if it exists
    oci dns record domain delete \
        --zone-name-or-id "$ZONE_NAME" \
        --domain "$domain" \
        --compartment-id "$COMPARTMENT_ID" \
        --force 2>/dev/null || true

    # Add new record
    oci dns record domain patch \
        --zone-name-or-id "$ZONE_NAME" \
        --domain "$domain" \
        --compartment-id "$COMPARTMENT_ID" \
        --scope GLOBAL \
        --items "[{
            \"domain\": \"$domain\",
            \"rtype\": \"$record_type\",
            \"rdata\": \"$rdata\",
            \"ttl\": $ttl
        }]" \
        >/dev/null

    success "Added $record_type record: $domain"
}

# Add apex A record
add_record "A" "$ZONE_NAME" "$SERVER_IP" 300

# Add www A record
add_record "A" "www.$ZONE_NAME" "$SERVER_IP" 300

# Add ns1 A record (for NSD nameserver)
add_record "A" "ns1.$ZONE_NAME" "$SERVER_IP" 300

# Add NS delegation for n.ipn.fyi
add_record "NS" "n.$ZONE_NAME" "ns1.$ZONE_NAME." 300

# Add IPv6 records if provided
if [ -n "$SERVER_IPV6" ]; then
    info "Adding IPv6 records..."
    add_record "AAAA" "$ZONE_NAME" "$SERVER_IPV6" 300
    add_record "AAAA" "www.$ZONE_NAME" "$SERVER_IPV6" 300
    add_record "AAAA" "ns1.$ZONE_NAME" "$SERVER_IPV6" 300
fi

# Display zone nameservers
info "Getting Oracle Cloud nameservers..."
NAMESERVERS=$(oci dns zone get --zone-name-or-id "$ZONE_NAME" --compartment-id "$COMPARTMENT_ID" | jq -r '.data.nameservers[]')

echo ""
success "DNS zone setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next Steps:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Update your domain registrar with these Oracle Cloud nameservers:"
echo ""
echo "$NAMESERVERS" | while read -r ns; do
    echo "   • $ns"
done
echo ""
echo "2. Wait for DNS propagation (up to 48 hours, usually 1-2 hours)"
echo ""
echo "3. Verify DNS records:"
echo "   dig ipn.fyi"
echo "   dig www.ipn.fyi"
echo "   dig ns1.ipn.fyi"
echo "   dig n.ipn.fyi NS"
echo ""
echo "4. Once propagated, deploy the ipn.fyi application"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# List all records
info "Current DNS records:"
oci dns record zone get \
    --zone-name-or-id "$ZONE_NAME" \
    --compartment-id "$COMPARTMENT_ID" \
    | jq -r '.data.items[] | "\(.domain) \(.ttl) IN \(.rtype) \(.rdata)"'

echo ""
success "Setup complete!"
