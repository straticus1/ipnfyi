terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
}

provider "oci" {
  # Configure via environment variables:
  # export TF_VAR_tenancy_ocid=<your-tenancy-ocid>
  # export TF_VAR_user_ocid=<your-user-ocid>
  # export TF_VAR_fingerprint=<your-api-key-fingerprint>
  # export TF_VAR_private_key_path=<path-to-private-key>
  # export TF_VAR_region=<your-region>
}

variable "compartment_id" {
  description = "OCI Compartment OCID"
  type        = string
}

variable "server_ipv4" {
  description = "IPv4 address of the ipn.fyi server"
  type        = string
}

variable "server_ipv6" {
  description = "IPv6 address of the ipn.fyi server (optional)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Domain name"
  type        = string
  default     = "ipn.fyi"
}

# Create DNS Zone
resource "oci_dns_zone" "ipnfyi" {
  compartment_id = var.compartment_id
  name           = var.domain_name
  zone_type      = "PRIMARY"
  scope          = "GLOBAL"
}

# Apex A Record (ipn.fyi)
resource "oci_dns_rrset" "apex_a" {
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = var.domain_name
  rtype           = "A"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = var.domain_name
    rdata  = var.server_ipv4
    rtype  = "A"
    ttl    = 300
  }
}

# WWW A Record
resource "oci_dns_rrset" "www_a" {
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = "www.${var.domain_name}"
  rtype           = "A"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = "www.${var.domain_name}"
    rdata  = var.server_ipv4
    rtype  = "A"
    ttl    = 300
  }
}

# NS1 A Record (Nameserver for NSD)
resource "oci_dns_rrset" "ns1_a" {
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = "ns1.${var.domain_name}"
  rtype           = "A"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = "ns1.${var.domain_name}"
    rdata  = var.server_ipv4
    rtype  = "A"
    ttl    = 300
  }
}

# NS Delegation for n.ipn.fyi (Dynamic DNS subdomain)
# This delegates n.ipn.fyi to NSD running on ns1.ipn.fyi
resource "oci_dns_rrset" "n_ns" {
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = "n.${var.domain_name}"
  rtype           = "NS"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = "n.${var.domain_name}"
    rdata  = "ns1.${var.domain_name}."
    rtype  = "NS"
    ttl    = 300
  }
}

# Optional: IPv6 AAAA Records
resource "oci_dns_rrset" "apex_aaaa" {
  count           = var.server_ipv6 != "" ? 1 : 0
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = var.domain_name
  rtype           = "AAAA"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = var.domain_name
    rdata  = var.server_ipv6
    rtype  = "AAAA"
    ttl    = 300
  }
}

resource "oci_dns_rrset" "www_aaaa" {
  count           = var.server_ipv6 != "" ? 1 : 0
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = "www.${var.domain_name}"
  rtype           = "AAAA"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = "www.${var.domain_name}"
    rdata  = var.server_ipv6
    rtype  = "AAAA"
    ttl    = 300
  }
}

resource "oci_dns_rrset" "ns1_aaaa" {
  count           = var.server_ipv6 != "" ? 1 : 0
  zone_name_or_id = oci_dns_zone.ipnfyi.name
  domain          = "ns1.${var.domain_name}"
  rtype           = "AAAA"
  compartment_id  = var.compartment_id
  scope           = "GLOBAL"

  items {
    domain = "ns1.${var.domain_name}"
    rdata  = var.server_ipv6
    rtype  = "AAAA"
    ttl    = 300
  }
}

# Outputs
output "zone_id" {
  description = "DNS Zone OCID"
  value       = oci_dns_zone.ipnfyi.id
}

output "nameservers" {
  description = "Oracle Cloud nameservers for this zone"
  value       = oci_dns_zone.ipnfyi.nameservers
}

output "dns_records_created" {
  description = "Summary of DNS records created"
  value = {
    apex_ipv4         = var.server_ipv4
    www_ipv4          = var.server_ipv4
    ns1_ipv4          = var.server_ipv4
    n_delegation      = "ns1.${var.domain_name}"
    apex_ipv6         = var.server_ipv6 != "" ? var.server_ipv6 : "not configured"
    www_ipv6          = var.server_ipv6 != "" ? var.server_ipv6 : "not configured"
    ns1_ipv6          = var.server_ipv6 != "" ? var.server_ipv6 : "not configured"
  }
}
