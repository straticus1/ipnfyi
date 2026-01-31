
# Kubernetes Deployment for ipn.fyi

Deploy ipn.fyi DDNS service to your existing Kubernetes cluster with ARM64 nodes.

## Prerequisites

- Kubernetes cluster with ARM64 nodes (detected: 4 nodes with aarch64)
- `kubectl` configured and connected to cluster
- `docker` installed for building images
- Neon PostgreSQL database
- Existing `ingress-nginx` controller (detected at 129.80.158.147)

## Quick Start

```bash
cd k8s

# Set your database URL
export DATABASE_URL="postgresql://user:pass@host.neon.tech/dbname?sslmode=require"

# Run deployment script
chmod +x deploy.sh
./deploy.sh
```

## Manual Deployment

### 1. Build Docker Image

```bash
# Build for ARM64
docker buildx build \
  --platform linux/arm64 \
  -f Dockerfile.alpine \
  -t ghcr.io/straticus1/ipnfyi:latest \
  .

# Push to registry (GitHub Container Registry)
docker push ghcr.io/straticus1/ipnfyi:latest
```

### 2. Create Namespace and ConfigMap

```bash
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
```

### 3. Create Secret

```bash
kubectl create secret generic ipnfyi-secret \
  --from-literal=DATABASE_URL='postgresql://user:pass@host.neon.tech/dbname?sslmode=require' \
  -n ipnfyi
```

### 4. Initialize Database

```bash
psql $DATABASE_URL -f ../schema.sql
psql $DATABASE_URL -f ../seed-data.sql
```

### 5. Deploy Application

```bash
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
```

### 6. Verify Deployment

```bash
# Check pods
kubectl get pods -n ipnfyi

# Check services
kubectl get svc -n ipnfyi

# Check ingress
kubectl get ingress -n ipnfyi

# View logs
kubectl logs -n ipnfyi -l app=ipnfyi -c api
kubectl logs -n ipnfyi -l app=ipnfyi -c nsd
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│ External DNS Queries                            │
│ (port 53 UDP/TCP)                               │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ LoadBalancer Service: ipnfyi-dns                │
│ External IP: <PENDING>                          │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ HTTP/HTTPS Traffic (ipn.fyi, www.ipn.fyi)      │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ Ingress: ipnfyi                                 │
│ Using existing ingress-nginx (129.80.158.147)  │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ Service: ipnfyi-api (ClusterIP)                 │
└────────────────┬────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────┐
│ Deployment: ipnfyi (2 replicas)                 │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Pod 1 (ARM64 node)                          │ │
│ │ ┌──────────────┐  ┌──────────────┐         │ │
│ │ │ Container:   │  │ Container:   │         │ │
│ │ │ api          │  │ nsd          │         │ │
│ │ │ (Node.js)    │  │ (DNS Server) │         │ │
│ │ │ Port: 3000   │  │ Port: 53     │         │ │
│ │ └──────────────┘  └──────────────┘         │ │
│ │   Shared Volume: /etc/nsd/zones             │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Pod 2 (ARM64 node)                          │ │
│ │ ... (same structure)                        │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Services

### ipnfyi-api (ClusterIP)
- **Type**: ClusterIP
- **Port**: 80 → 3000
- **Purpose**: Internal API access for Ingress

### ipnfyi-dns (LoadBalancer)
- **Type**: LoadBalancer
- **Ports**: 53/UDP, 53/TCP
- **Purpose**: External DNS queries for n.ipn.fyi

## DNS Configuration

Once deployed, get the LoadBalancer IP:

```bash
kubectl get svc ipnfyi-dns -n ipnfyi
```

Update your DNS records:

```
ns1.ipn.fyi    A     <LoadBalancer-IP>
ipn.fyi        A     129.80.158.147  (ingress IP)
www.ipn.fyi    A     129.80.158.147  (ingress IP)
n.ipn.fyi      NS    ns1.ipn.fyi.
```

## Management

### View Logs

```bash
# API logs
kubectl logs -n ipnfyi -l app=ipnfyi -c api -f

# NSD logs
kubectl logs -n ipnfyi -l app=ipnfyi -c nsd -f

# Both
kubectl logs -n ipnfyi -l app=ipnfyi --all-containers -f
```

### Use CLI Tool

```bash
# List API keys
kubectl exec -n ipnfyi deployment/ipnfyi -c api -- node ipnfyi-cli.js list-keys

# List domains
kubectl exec -n ipnfyi deployment/ipnfyi -c api -- node ipnfyi-cli.js list-domains

# Create new key
kubectl exec -n ipnfyi deployment/ipnfyi -c api -- node ipnfyi-cli.js create-key newuser

# View stats
kubectl exec -n ipnfyi deployment/ipnfyi -c api -- node ipnfyi-cli.js stats
```

### Scale Deployment

```bash
# Scale to 3 replicas
kubectl scale deployment ipnfyi -n ipnfyi --replicas=3

# Auto-scale
kubectl autoscale deployment ipnfyi -n ipnfyi --min=2 --max=5 --cpu-percent=80
```

### Update Application

```bash
# Build new image with timestamp tag
docker buildx build \
  --platform linux/arm64 \
  -f Dockerfile.alpine \
  -t ghcr.io/straticus1/ipnfyi:$(date +%Y%m%d-%H%M%S) \
  -t ghcr.io/straticus1/ipnfyi:latest \
  --push \
  .

# Rollout update
kubectl rollout restart deployment ipnfyi -n ipnfyi

# Check rollout status
kubectl rollout status deployment ipnfyi -n ipnfyi

# View rollout history
kubectl rollout history deployment ipnfyi -n ipnfyi

# Rollback if needed
kubectl rollout undo deployment ipnfyi -n ipnfyi
```

## Testing

### Test API

```bash
# Port forward to test locally
kubectl port-forward -n ipnfyi svc/ipnfyi-api 3000:80

# Test health endpoint
curl http://localhost:3000/api/health

# Test update (use default key)
curl -X POST http://localhost:3000/api/update \
  -H "X-API-Key: a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2" \
  -H "Content-Type: application/json" \
  -d '{"domain":"dsc","ipv4":"1.2.3.4"}'
```

### Test DNS

```bash
# Get DNS service IP
DNS_IP=$(kubectl get svc ipnfyi-dns -n ipnfyi -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Test DNS query
dig @$DNS_IP test.n.ipn.fyi

# Test from within cluster
kubectl run -it --rm debug --image=alpine --restart=Never -- sh
apk add bind-tools
dig @ipnfyi-dns.ipnfyi.svc.cluster.local test.n.ipn.fyi
```

## Monitoring

### Resource Usage

```bash
# Pod resource usage
kubectl top pods -n ipnfyi

# Node resource usage
kubectl top nodes

# Describe deployment
kubectl describe deployment ipnfyi -n ipnfyi
```

### Events

```bash
# Watch events
kubectl get events -n ipnfyi --watch

# Get recent events
kubectl get events -n ipnfyi --sort-by='.lastTimestamp'
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl get pods -n ipnfyi

# Describe pod
kubectl describe pod <pod-name> -n ipnfyi

# Check logs
kubectl logs <pod-name> -n ipnfyi -c api
kubectl logs <pod-name> -n ipnfyi -c nsd
```

### DNS not resolving

```bash
# Check NSD logs
kubectl logs -n ipnfyi -l app=ipnfyi -c nsd

# Check zone file
kubectl exec -n ipnfyi deployment/ipnfyi -c nsd -- cat /etc/nsd/zones/n.ipn.fyi.zone

# Test NSD locally
kubectl exec -n ipnfyi deployment/ipnfyi -c nsd -- nsd-control status
```

### Database connection issues

```bash
# Check secret
kubectl get secret ipnfyi-secret -n ipnfyi -o yaml

# Test connection from pod
kubectl exec -n ipnfyi deployment/ipnfyi -c api -- node -e "const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL});pool.query('SELECT 1').then(()=>console.log('OK')).catch(e=>console.error(e))"
```

### Ingress not working

```bash
# Check ingress
kubectl describe ingress ipnfyi -n ipnfyi

# Check ingress controller logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# Check cert-manager (if using)
kubectl get certificate -n ipnfyi
kubectl describe certificate ipnfyi-tls -n ipnfyi
```

## Cleanup

```bash
# Delete everything
kubectl delete namespace ipnfyi

# Or delete individual resources
kubectl delete -f ingress.yaml
kubectl delete -f service.yaml
kubectl delete -f deployment.yaml
kubectl delete -f configmap.yaml
kubectl delete secret ipnfyi-secret -n ipnfyi
kubectl delete -f namespace.yaml
```

## Production Checklist

- [ ] SSL certificate configured (cert-manager)
- [ ] Resource limits set appropriately
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Logging aggregation (EFK/Loki)
- [ ] Backups automated for database
- [ ] DNS records updated and propagated
- [ ] Rate limiting configured
- [ ] Security policies applied (NetworkPolicy)
- [ ] Secrets managed securely (Vault/Sealed Secrets)
- [ ] Auto-scaling configured (HPA)
- [ ] LoadBalancer IP reserved/static

## ARM-Specific Notes

- All images are multi-arch (supports both ARM64 and AMD64)
- Node affinity ensures pods run on ARM64 nodes
- Base image `node:20-alpine` has native ARM64 support
- NSD Alpine package supports ARM64 architecture
- No emulation required - fully native ARM execution

## Resource Requirements

**Minimum per pod:**
- CPU: 350m (250m API + 100m NSD)
- Memory: 384Mi (256Mi API + 128Mi NSD)

**Recommended for production:**
- 2-3 replicas
- CPU: 1500m per pod (1000m API + 500m NSD)
- Memory: 768Mi per pod (512Mi API + 256Mi NSD)

**Cluster capacity needed:**
- For 2 replicas: 700m CPU, 768Mi RAM
- For 3 replicas: 1050m CPU, 1152Mi RAM

Your cluster (4 ARM64 nodes) can easily handle this workload.
