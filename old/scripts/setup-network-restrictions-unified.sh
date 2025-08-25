#!/bin/bash

# Setup Network Restrictions with Squid Proxy
# This script sets up a Squid proxy to restrict network access to whitelisted domains only.
# Works with both GitHub Actions and GitLab CI

set -e

# Source the temp directory utility
source "$(dirname "$0")/get-temp-directory.sh"

# Check if experimental_allowed_domains is provided
if [ -z "$EXPERIMENTAL_ALLOWED_DOMAINS" ]; then
  echo "ERROR: EXPERIMENTAL_ALLOWED_DOMAINS environment variable is required"
  exit 1
fi

# Check required environment variables
if [ -z "$TEMP_DIR" ]; then
  echo "ERROR: Could not determine temporary directory"
  exit 1
fi

# For GitHub Actions, we need GITHUB_ENV
# For GitLab CI, we'll write to a file that can be sourced
if [ -n "$GITHUB_ENV" ]; then
  ENV_FILE="$GITHUB_ENV"
elif [ -n "$GITLAB_CI" ]; then
  ENV_FILE="$TEMP_DIR/proxy-env.sh"
else
  echo "WARNING: Neither GITHUB_ENV nor GITLAB_CI detected, proxy env vars will not persist"
  ENV_FILE="/dev/null"
fi

echo "Setting up network restrictions with Squid proxy..."
echo "Using temp directory: $TEMP_DIR (source: $TEMP_SOURCE)"

SQUID_START_TIME=$(date +%s.%N)

# Create whitelist file
echo "$EXPERIMENTAL_ALLOWED_DOMAINS" > $TEMP_DIR/whitelist.txt

# Ensure each domain has proper format
# If domain doesn't start with a dot and isn't an IP, add the dot for subdomain matching
mv $TEMP_DIR/whitelist.txt $TEMP_DIR/whitelist.txt.orig
while IFS= read -r domain; do
  if [ -n "$domain" ]; then
    # Trim whitespace
    domain=$(echo "$domain" | xargs)
    # If it's not empty and doesn't start with a dot, add one
    if [[ "$domain" != .* ]] && [[ ! "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo ".$domain" >> $TEMP_DIR/whitelist.txt
    else
      echo "$domain" >> $TEMP_DIR/whitelist.txt
    fi
  fi
done < $TEMP_DIR/whitelist.txt.orig

# Create Squid config with whitelist
cat > $TEMP_DIR/squid.conf << 'EOF'
http_port 3128

# Define ACLs
acl whitelist dstdomain "/etc/squid/whitelist.txt"
acl localnet src 127.0.0.1/32
acl localnet src 172.17.0.0/16
acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 443
acl CONNECT method CONNECT

# Deny requests to certain unsafe ports
http_access deny !Safe_ports

# Only allow CONNECT to SSL ports
http_access deny CONNECT !SSL_ports

# Allow localhost
http_access allow localhost

# Allow localnet access to whitelisted domains
http_access allow localnet whitelist

# Deny everything else
http_access deny all
EOF

echo "Starting Squid proxy..."
# First, remove any existing container
sudo docker rm -f squid-proxy 2>/dev/null || true

# Ensure whitelist file is not empty (Squid fails with empty files)
if [ ! -s "$TEMP_DIR/whitelist.txt" ]; then
  echo "WARNING: Whitelist file is empty, adding a dummy entry"
  echo ".example.com" >> $TEMP_DIR/whitelist.txt
fi

# Use sudo to prevent Claude from stopping the container
CONTAINER_ID=$(sudo docker run -d \
  --name squid-proxy \
  -p 127.0.0.1:3128:3128 \
  -v $TEMP_DIR/squid.conf:/etc/squid/squid.conf:ro \
  -v $TEMP_DIR/whitelist.txt:/etc/squid/whitelist.txt:ro \
  ubuntu/squid:latest 2>&1) || {
  echo "ERROR: Failed to start Squid container"
  exit 1
}

# Wait for proxy to be ready (usually < 1 second)
READY=false
for i in {1..30}; do
  if nc -z 127.0.0.1 3128 2>/dev/null; then
    TOTAL_TIME=$(echo "scale=3; $(date +%s.%N) - $SQUID_START_TIME" | bc)
    echo "Squid proxy ready in ${TOTAL_TIME}s"
    READY=true
    break
  fi
  sleep 0.1
done

if [ "$READY" != "true" ]; then
  echo "ERROR: Squid proxy failed to start within 3 seconds"
  echo "Container logs:"
  sudo docker logs squid-proxy 2>&1 || true
  echo "Container status:"
  sudo docker ps -a | grep squid-proxy || true
  exit 1
fi

# Set proxy environment variables
if [ "$ENV_FILE" != "/dev/null" ]; then
  if [ -n "$GITLAB_CI" ]; then
    # For GitLab CI, create a script that can be sourced
    cat > "$ENV_FILE" << 'EOF'
export http_proxy=http://127.0.0.1:3128
export https_proxy=http://127.0.0.1:3128
export HTTP_PROXY=http://127.0.0.1:3128
export HTTPS_PROXY=http://127.0.0.1:3128
EOF
    echo "Proxy environment variables saved to: $ENV_FILE"
    echo "Source this file to apply proxy settings: source $ENV_FILE"
  else
    # For GitHub Actions, append to GITHUB_ENV
    echo "http_proxy=http://127.0.0.1:3128" >> $ENV_FILE
    echo "https_proxy=http://127.0.0.1:3128" >> $ENV_FILE
    echo "HTTP_PROXY=http://127.0.0.1:3128" >> $ENV_FILE
    echo "HTTPS_PROXY=http://127.0.0.1:3128" >> $ENV_FILE
  fi
fi

echo "Network restrictions setup completed successfully"