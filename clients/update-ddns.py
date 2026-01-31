#!/usr/bin/env python3
"""
ipn.fyi Dynamic DNS Update Client
Usage: python3 update-ddns.py [domain]
"""

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
API_URL = os.environ.get('IPN_API_URL', 'https://ipn.fyi/api/update')
CONFIG_FILE = Path.home() / '.ipnfyi.json'


def load_config():
    """Load configuration from file or environment"""
    config = {
        'api_key': os.environ.get('IPN_API_KEY'),
        'domain': None
    }

    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, 'r') as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            print(f"Warning: Could not load config file: {e}")

    return config


def get_public_ip(version=4):
    """Get public IP address"""
    services = [
        f'https://api{"6" if version == 6 else ""}.ipify.org',
        'https://icanhazip.com',
        'https://ifconfig.me'
    ]

    for service in services:
        try:
            req = urllib.request.Request(service)
            with urllib.request.urlopen(req, timeout=5) as response:
                ip = response.read().decode('utf-8').strip()
                if ip:
                    return ip
        except Exception:
            continue

    return None


def update_dns(api_key, domain, ipv4=None, ipv6=None):
    """Update DNS record via API"""
    if not ipv4 and not ipv6:
        raise ValueError("At least one IP address (IPv4 or IPv6) is required")

    payload = {
        'domain': domain
    }

    if ipv4:
        payload['ipv4'] = ipv4
    if ipv6:
        payload['ipv6'] = ipv6

    data = json.dumps(payload).encode('utf-8')

    req = urllib.request.Request(
        API_URL,
        data=data,
        headers={
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_data = json.loads(error_body)
            raise Exception(f"API Error: {error_data.get('error', 'Unknown error')}")
        except json.JSONDecodeError:
            raise Exception(f"HTTP Error {e.code}: {error_body}")
    except urllib.error.URLError as e:
        raise Exception(f"Connection error: {e.reason}")


def main():
    # Load configuration
    config = load_config()

    # Get domain from command line or config
    domain = sys.argv[1] if len(sys.argv) > 1 else config.get('domain')

    if not domain:
        print("Error: Domain not specified")
        print("Usage: python3 update-ddns.py [domain]")
        print("Or set 'domain' in ~/.ipnfyi.json")
        sys.exit(1)

    if not config['api_key']:
        print("Error: API key not set")
        print("Set IPN_API_KEY environment variable or create ~/.ipnfyi.json:")
        print(json.dumps({'api_key': 'your_key_here', 'domain': 'your_domain'}, indent=2))
        sys.exit(1)

    # Detect IP addresses
    print("Detecting IP addresses...")
    ipv4 = get_public_ip(4)
    ipv6 = get_public_ip(6)

    if ipv4:
        print(f"IPv4: {ipv4}")
    if ipv6:
        print(f"IPv6: {ipv6}")

    if not ipv4 and not ipv6:
        print("Error: Could not detect any IP address")
        sys.exit(1)

    # Update DNS
    print(f"Updating DNS record for {domain}.n.ipn.fyi...")
    try:
        result = update_dns(config['api_key'], domain, ipv4, ipv6)

        if result.get('success'):
            print("Success! DNS updated.")
            print(f"Domain: {result.get('domain')}")
            if result.get('ipv4'):
                print(f"IPv4: {result.get('ipv4')}")
            if result.get('ipv6'):
                print(f"IPv6: {result.get('ipv6')}")
        else:
            print("Update failed:")
            print(json.dumps(result, indent=2))
            sys.exit(1)

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
