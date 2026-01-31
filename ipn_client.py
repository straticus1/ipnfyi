#!/usr/bin/env python3
"""
ipn.fyi Dynamic DNS Client
Automatically updates DNS records based on current IP address
"""

import os
import sys
import json
import urllib.request
import urllib.error
import argparse
from pathlib import Path

# Default config locations
CONFIG_LOCATIONS = [
    Path.home() / '.ipnfyi' / 'config.json',
    Path.home() / '.ipnfyi.json',
    Path('.ipnfyi.json'),
    Path('config.json')
]

DEFAULT_CONFIG = {
    'api_url': 'https://ipn.fyi/api/update',
    'api_key': '',
    'domain': '',
    'auto_detect_ipv4': True,
    'auto_detect_ipv6': False,
    'ipv4': None,
    'ipv6': None
}


class Colors:
    """Terminal colors"""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    END = '\033[0m'
    BOLD = '\033[1m'


def log(message, color=None):
    """Print colored log message"""
    if color:
        print(f"{color}{message}{Colors.END}")
    else:
        print(message)


def error(message):
    """Print error message"""
    log(f"✗ Error: {message}", Colors.RED)


def success(message):
    """Print success message"""
    log(f"✓ {message}", Colors.GREEN)


def info(message):
    """Print info message"""
    log(f"ℹ {message}", Colors.BLUE)


def load_config():
    """Load configuration from file"""
    for config_path in CONFIG_LOCATIONS:
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config = DEFAULT_CONFIG.copy()
                    config.update(json.load(f))
                    info(f"Loaded config from: {config_path}")
                    return config
            except Exception as e:
                error(f"Failed to load config from {config_path}: {e}")
                continue

    error("No config file found. Use --init to create one.")
    return None


def save_config(config, path=None):
    """Save configuration to file"""
    if path is None:
        path = CONFIG_LOCATIONS[0]

    # Create directory if it doesn't exist
    path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(path, 'w') as f:
            json.dump(config, f, indent=2)
        success(f"Config saved to: {path}")
        return True
    except Exception as e:
        error(f"Failed to save config: {e}")
        return False


def init_config():
    """Initialize configuration file"""
    log(f"\n{Colors.BOLD}ipn.fyi DNS Client - Configuration{Colors.END}\n")

    config = DEFAULT_CONFIG.copy()

    # Get API key
    api_key = input(f"{Colors.CYAN}API Key: {Colors.END}").strip()
    if not api_key:
        error("API key is required")
        return False
    config['api_key'] = api_key

    # Get domain
    domain = input(f"{Colors.CYAN}Domain (e.g., 'dsc' for dsc.n.ipn.fyi): {Colors.END}").strip()
    if not domain:
        error("Domain is required")
        return False
    config['domain'] = domain

    # API URL
    api_url = input(f"{Colors.CYAN}API URL [{config['api_url']}]: {Colors.END}").strip()
    if api_url:
        config['api_url'] = api_url

    # Auto-detect IP
    auto_detect = input(f"{Colors.CYAN}Auto-detect IP address? [Y/n]: {Colors.END}").strip().lower()
    config['auto_detect_ipv4'] = auto_detect != 'n'

    # Save config
    config_path = CONFIG_LOCATIONS[0]
    return save_config(config, config_path)


def get_public_ip(version=4):
    """Get public IP address"""
    services = {
        4: [
            'https://api.ipify.org',
            'https://icanhazip.com',
            'https://ifconfig.me/ip',
            'https://ipecho.net/plain'
        ],
        6: [
            'https://api6.ipify.org',
            'https://icanhazip.com',
            'https://ifconfig.me/ip'
        ]
    }

    for service in services.get(version, []):
        try:
            req = urllib.request.Request(service)
            with urllib.request.urlopen(req, timeout=5) as response:
                ip = response.read().decode('utf-8').strip()
                if ip:
                    return ip
        except Exception:
            continue

    return None


def update_dns(config, ipv4=None, ipv6=None):
    """Update DNS record via API"""
    api_url = config['api_url']
    api_key = config['api_key']
    domain = config['domain']

    # Detect IPs if needed
    if config.get('auto_detect_ipv4', True) and not ipv4:
        info("Detecting IPv4 address...")
        ipv4 = get_public_ip(4)
        if ipv4:
            log(f"  IPv4: {ipv4}", Colors.CYAN)

    if config.get('auto_detect_ipv6', False) and not ipv6:
        info("Detecting IPv6 address...")
        ipv6 = get_public_ip(6)
        if ipv6:
            log(f"  IPv6: {ipv6}", Colors.CYAN)

    # Use config IPs if specified
    if not ipv4 and config.get('ipv4'):
        ipv4 = config['ipv4']

    if not ipv6 and config.get('ipv6'):
        ipv6 = config['ipv6']

    # Validate we have at least one IP
    if not ipv4 and not ipv6:
        error("No IP address provided or detected")
        return False

    # Build payload
    payload = {'domain': domain}
    if ipv4:
        payload['ipv4'] = ipv4
    if ipv6:
        payload['ipv6'] = ipv6

    # Make API request
    data = json.dumps(payload).encode('utf-8')

    req = urllib.request.Request(
        api_url,
        data=data,
        headers={
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        },
        method='POST'
    )

    try:
        info(f"Updating DNS record for {domain}.n.ipn.fyi...")

        with urllib.request.urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode('utf-8'))

            if result.get('success'):
                success(f"DNS updated successfully!")
                log(f"  Domain: {result.get('domain')}", Colors.CYAN)
                if result.get('ipv4'):
                    log(f"  IPv4: {result.get('ipv4')}", Colors.CYAN)
                if result.get('ipv6'):
                    log(f"  IPv6: {result.get('ipv6')}", Colors.CYAN)
                return True
            else:
                error(f"Update failed: {result}")
                return False

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        try:
            error_data = json.loads(error_body)
            error(f"API Error: {error_data.get('error', 'Unknown error')}")
            if 'message' in error_data:
                log(f"  {error_data['message']}", Colors.YELLOW)
        except json.JSONDecodeError:
            error(f"HTTP Error {e.code}: {error_body}")
        return False

    except urllib.error.URLError as e:
        error(f"Connection error: {e.reason}")
        return False

    except Exception as e:
        error(f"Unexpected error: {e}")
        return False


def show_config(config):
    """Display current configuration"""
    log(f"\n{Colors.BOLD}Current Configuration:{Colors.END}\n")
    log(f"API URL:          {config.get('api_url', 'Not set')}", Colors.CYAN)
    log(f"API Key:          {'*' * 20}...{config.get('api_key', '')[-10:]}", Colors.CYAN)
    log(f"Domain:           {config.get('domain', 'Not set')}.n.ipn.fyi", Colors.CYAN)
    log(f"Auto-detect IPv4: {config.get('auto_detect_ipv4', False)}", Colors.CYAN)
    log(f"Auto-detect IPv6: {config.get('auto_detect_ipv6', False)}", Colors.CYAN)
    if config.get('ipv4'):
        log(f"Static IPv4:      {config.get('ipv4')}", Colors.CYAN)
    if config.get('ipv6'):
        log(f"Static IPv6:      {config.get('ipv6')}", Colors.CYAN)
    print()


def main():
    parser = argparse.ArgumentParser(
        description='ipn.fyi Dynamic DNS Client',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Initialize configuration
  %(prog)s --init

  # Update DNS with auto-detected IP
  %(prog)s

  # Update DNS with specific IP
  %(prog)s --ipv4 1.2.3.4

  # Update with both IPv4 and IPv6
  %(prog)s --ipv4 1.2.3.4 --ipv6 2001:db8::1

  # Show current configuration
  %(prog)s --show-config

  # Use specific config file
  %(prog)s --config /path/to/config.json
        """
    )

    parser.add_argument('--init', action='store_true',
                        help='Initialize configuration file')
    parser.add_argument('--config', type=str,
                        help='Path to config file')
    parser.add_argument('--ipv4', type=str,
                        help='IPv4 address to set')
    parser.add_argument('--ipv6', type=str,
                        help='IPv6 address to set')
    parser.add_argument('--domain', type=str,
                        help='Override domain from config')
    parser.add_argument('--show-config', action='store_true',
                        help='Show current configuration')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Verbose output')

    args = parser.parse_args()

    # Initialize config
    if args.init:
        if init_config():
            success("Configuration initialized!")
            return 0
        else:
            return 1

    # Load config
    if args.config:
        config_path = Path(args.config)
        if config_path.exists():
            with open(config_path, 'r') as f:
                config = json.load(f)
        else:
            error(f"Config file not found: {args.config}")
            return 1
    else:
        config = load_config()
        if not config:
            log("\nRun with --init to create a configuration file", Colors.YELLOW)
            return 1

    # Show config
    if args.show_config:
        show_config(config)
        return 0

    # Validate config
    if not config.get('api_key'):
        error("API key not configured. Run with --init")
        return 1

    if not config.get('domain') and not args.domain:
        error("Domain not configured. Run with --init or use --domain")
        return 1

    # Override domain if provided
    if args.domain:
        config['domain'] = args.domain

    # Update DNS
    if update_dns(config, ipv4=args.ipv4, ipv6=args.ipv6):
        return 0
    else:
        return 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("\nInterrupted by user", Colors.YELLOW)
        sys.exit(130)
