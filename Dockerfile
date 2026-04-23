# Multi-arch Dockerfile for ipn.fyi DDNS Service
# Supports both ARM64 (Oracle Cloud Free Tier) and AMD64 (x86_64)

FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    postgresql-client \
    nsd \
    nsd-openrc \
    curl \
    bash

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application files
COPY server.js .
COPY ipnfyi-cli.js .
COPY scripts/ ./scripts/
COPY public/ ./public/

# Create directories for NSD
RUN mkdir -p /etc/nsd/zones /var/db/nsd /var/run/nsd

# Make CLI executable
RUN chmod +x ipnfyi-cli.js

# Create non-root user
RUN addgroup -g 1001 ipnfyi && \
    adduser -D -u 1001 -G ipnfyi ipnfyi && \
    chown -R ipnfyi:ipnfyi /app /etc/nsd /var/db/nsd /var/run/nsd

# Expose ports
EXPOSE 3000 53/udp 53/tcp

# Switch to non-root user
USER ipnfyi

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
