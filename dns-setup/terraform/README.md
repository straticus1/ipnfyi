# Terraform Configuration for ipn.fyi DNS

This directory contains Terraform configuration to set up DNS records for ipn.fyi in Oracle Cloud DNS.

## What This Creates

- **DNS Zone**: `ipn.fyi` primary zone
- **A Records**:
  - `ipn.fyi` → Your server IP
  - `www.ipn.fyi` → Your server IP
  - `ns1.ipn.fyi` → Your server IP (nameserver for NSD)
- **NS Delegation**: `n.ipn.fyi` → `ns1.ipn.fyi` (for dynamic DNS)
- **AAAA Records** (optional): IPv6 versions of the above

## Prerequisites

1. **Oracle Cloud Account** with appropriate permissions
2. **Terraform** installed (v1.0+)
3. **OCI CLI** configured with API key
4. **Server IP Address** from your Oracle Cloud instance

## Setup

### 1. Configure OCI Provider

Set environment variables for OCI authentication:

```bash
export TF_VAR_tenancy_ocid="ocid1.tenancy.oc1..aaaaaaaxxxxxxxxx"
export TF_VAR_user_ocid="ocid1.user.oc1..aaaaaaaxxxxxxxxx"
export TF_VAR_fingerprint="xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx"
export TF_VAR_private_key_path="~/.oci/oci_api_key.pem"
export TF_VAR_region="us-ashburn-1"
```

Or configure in `~/.oci/config`:

```ini
[DEFAULT]
user=ocid1.user.oc1..aaaaaaaxxxxxxxxx
fingerprint=xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx:xx
tenancy=ocid1.tenancy.oc1..aaaaaaaxxxxxxxxx
region=us-ashburn-1
key_file=~/.oci/oci_api_key.pem
```

### 2. Create terraform.tfvars

```bash
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars
```

Update with your values:

```hcl
compartment_id = "ocid1.compartment.oc1..aaaaaaaaxxxxxxxxx"
server_ipv4    = "123.456.789.012"
server_ipv6    = "2001:0db8:85a3::7334"  # Optional
```

### 3. Initialize Terraform

```bash
terraform init
```

### 4. Plan the Changes

```bash
terraform plan
```

Review the planned changes to ensure they're correct.

### 5. Apply the Configuration

```bash
terraform apply
```

Type `yes` when prompted to create the resources.

### 6. Get Nameserver Information

```bash
terraform output nameservers
```

## Updating DNS Records

To update the server IP address:

1. Edit `terraform.tfvars` with the new IP
2. Run `terraform plan` to review changes
3. Run `terraform apply` to apply changes

## Destroying Resources

To remove all DNS records:

```bash
terraform destroy
```

⚠️ **Warning**: This will delete the DNS zone and all records.

## Post-Deployment

After Terraform creates the DNS zone:

1. **Update Domain Registrar**: Point your domain to Oracle Cloud nameservers
   ```bash
   terraform output nameservers
   ```

2. **Wait for Propagation**: DNS changes can take up to 48 hours (usually 1-2 hours)

3. **Verify DNS**:
   ```bash
   dig ipn.fyi
   dig www.ipn.fyi
   dig ns1.ipn.fyi
   dig n.ipn.fyi NS
   ```

4. **Deploy Application**: Once DNS is working, deploy the ipn.fyi DDNS service

## DNS Architecture

```
┌─────────────────────────────────────────────────┐
│ Domain Registrar                                │
│ ↓ Nameservers point to Oracle Cloud DNS         │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Oracle Cloud DNS (Managed by Terraform)         │
│                                                 │
│ ipn.fyi        → A     → 123.456.789.012        │
│ www.ipn.fyi    → A     → 123.456.789.012        │
│ ns1.ipn.fyi    → A     → 123.456.789.012        │
│ n.ipn.fyi      → NS    → ns1.ipn.fyi.           │
└─────────────────────────────────────────────────┘
                    ↓ (n.ipn.fyi delegation)
┌─────────────────────────────────────────────────┐
│ NSD on ns1.ipn.fyi (Dynamic DNS)                │
│                                                 │
│ dsc.n.ipn.fyi     → A → (managed by API)        │
│ rams.n.ipn.fyi    → A → (managed by API)        │
│ david.n.ipn.fyi   → A → (managed by API)        │
│ *.n.ipn.fyi       → A → (managed by API)        │
└─────────────────────────────────────────────────┘
```

## Troubleshooting

### "Error: Service error:NotAuthenticated"

Your OCI credentials are not configured correctly. Verify:
- Environment variables are set
- OCI CLI is configured (`oci setup config`)
- API key is valid

### "Error: 404-NotAuthorizedOrNotFound"

The compartment OCID is incorrect or you don't have permissions. Verify:
- Compartment OCID is correct
- You have permissions to manage DNS in this compartment

### DNS Not Resolving

- Check that nameservers are updated at your registrar
- Wait for DNS propagation (use `dig +trace ipn.fyi` to debug)
- Verify records were created: `terraform show`

## Files

- `main.tf` - Main Terraform configuration
- `terraform.tfvars.example` - Example variables file
- `terraform.tfvars` - Your variables (gitignored)
- `.terraform/` - Terraform working directory (gitignored)
- `terraform.tfstate` - State file (gitignored, contains sensitive data)

## Security Notes

- `terraform.tfvars` contains your configuration and is gitignored
- `terraform.tfstate` may contain sensitive data and is gitignored
- Store state in OCI Object Storage for production use
- Use Terraform Cloud for team collaboration
