#!/bin/bash

# Kubernetes Deployment Script for ipn.fyi
# Deploys to existing K8s cluster with ARM64 nodes

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ipn.fyi DDNS Kubernetes Deployment${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check prerequisites
command -v kubectl >/dev/null 2>&1 || { echo -e "${RED}Error: kubectl is not installed${NC}"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Error: docker is not installed${NC}"; exit 1; }

# Check if kubectl is connected
kubectl cluster-info >/dev/null 2>&1 || { echo -e "${RED}Error: kubectl is not connected to a cluster${NC}"; exit 1; }

echo -e "${GREEN}✓${NC} Prerequisites check passed"
echo ""

# Step 1: Build and push Docker image
echo -e "${YELLOW}Step 1: Building Docker image for ARM64...${NC}"

# Check if we should use GitHub Container Registry or local registry
read -p "Push to GitHub Container Registry (ghcr.io)? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    IMAGE_REGISTRY="ghcr.io/straticus1"
    echo -e "${YELLOW}Building multi-arch image for ghcr.io...${NC}"

    # Build for ARM64
    docker buildx build \
        --platform linux/arm64 \
        -f Dockerfile.alpine \
        -t ${IMAGE_REGISTRY}/ipnfyi:latest \
        -t ${IMAGE_REGISTRY}/ipnfyi:$(date +%Y%m%d-%H%M%S) \
        --push \
        .

    echo -e "${GREEN}✓${NC} Image pushed to ${IMAGE_REGISTRY}/ipnfyi:latest"
else
    IMAGE_REGISTRY="localhost:5000"
    echo -e "${YELLOW}Building for local registry...${NC}"

    docker build -f Dockerfile.alpine -t ${IMAGE_REGISTRY}/ipnfyi:latest .
    docker push ${IMAGE_REGISTRY}/ipnfyi:latest || echo -e "${YELLOW}Warning: Could not push to local registry${NC}"

    echo -e "${GREEN}✓${NC} Image built: ${IMAGE_REGISTRY}/ipnfyi:latest"
fi

echo ""

# Step 2: Create namespace
echo -e "${YELLOW}Step 2: Creating namespace...${NC}"
kubectl apply -f namespace.yaml
echo -e "${GREEN}✓${NC} Namespace created"
echo ""

# Step 3: Create secret
echo -e "${YELLOW}Step 3: Setting up database secret...${NC}"

if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}DATABASE_URL environment variable not set${NC}"
    read -p "Enter Neon PostgreSQL connection string: " DATABASE_URL
fi

kubectl create secret generic ipnfyi-secret \
    --from-literal=DATABASE_URL="$DATABASE_URL" \
    -n ipnfyi \
    --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✓${NC} Secret created"
echo ""

# Step 4: Initialize database
echo -e "${YELLOW}Step 4: Initializing database...${NC}"
read -p "Initialize database schema and seed data? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if command -v psql >/dev/null 2>&1; then
        echo "Running schema..."
        psql "$DATABASE_URL" -f ../schema.sql
        echo "Loading seed data..."
        psql "$DATABASE_URL" -f ../seed-data.sql
        echo -e "${GREEN}✓${NC} Database initialized"
    else
        echo -e "${YELLOW}Warning: psql not installed, skipping database init${NC}"
        echo "Run manually: psql \$DATABASE_URL -f schema.sql"
    fi
fi
echo ""

# Step 5: Deploy application
echo -e "${YELLOW}Step 5: Deploying application...${NC}"

# Update image in deployment if using custom registry
if [ "$IMAGE_REGISTRY" != "ghcr.io/straticus1" ]; then
    sed -i.bak "s|ghcr.io/straticus1/ipnfyi:latest|${IMAGE_REGISTRY}/ipnfyi:latest|g" deployment.yaml
fi

kubectl apply -f configmap.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml

# Restore original deployment.yaml if modified
if [ -f deployment.yaml.bak ]; then
    mv deployment.yaml.bak deployment.yaml
fi

echo -e "${GREEN}✓${NC} Application deployed"
echo ""

# Step 6: Wait for pods
echo -e "${YELLOW}Step 6: Waiting for pods to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=ipnfyi -n ipnfyi --timeout=120s || true
echo ""

# Step 7: Get service information
echo -e "${YELLOW}Step 7: Service Information${NC}"
echo ""

echo "DNS LoadBalancer Service:"
kubectl get svc ipnfyi-dns -n ipnfyi

echo ""
echo "Ingress:"
kubectl get ingress ipnfyi -n ipnfyi

echo ""
echo "Pods:"
kubectl get pods -n ipnfyi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Get DNS LoadBalancer IP
DNS_IP=$(kubectl get svc ipnfyi-dns -n ipnfyi -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending...")
INGRESS_IP=$(kubectl get ingress ipnfyi -n ipnfyi -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending...")

echo "Next Steps:"
echo ""
echo "1. Update DNS records:"
echo "   ns1.ipn.fyi    A     ${DNS_IP}"
echo "   ipn.fyi        A     ${INGRESS_IP}"
echo "   www.ipn.fyi    A     ${INGRESS_IP}"
echo "   n.ipn.fyi      NS    ns1.ipn.fyi."
echo ""
echo "2. Test the API:"
echo "   kubectl port-forward -n ipnfyi svc/ipnfyi-api 3000:80"
echo "   curl http://localhost:3000/api/health"
echo ""
echo "3. View logs:"
echo "   kubectl logs -n ipnfyi -l app=ipnfyi -c api -f"
echo "   kubectl logs -n ipnfyi -l app=ipnfyi -c nsd -f"
echo ""
echo "4. Manage with CLI:"
echo "   kubectl exec -n ipnfyi -it deployment/ipnfyi -c api -- node ipnfyi-cli.js help"
echo ""
echo "5. Monitor:"
echo "   kubectl get all -n ipnfyi"
echo "   kubectl top pods -n ipnfyi"
echo ""
