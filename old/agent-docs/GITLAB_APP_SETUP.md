# Setting Up Claude Code as a GitLab Application

This guide explains how to set up Claude Code as a GitLab application (OAuth app) for both GitLab.com and self-hosted GitLab instances. This approach provides better security and user experience compared to using personal access tokens.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setting Up on GitLab.com](#setting-up-on-gitlabcom)
- [Setting Up on Self-Hosted GitLab](#setting-up-on-self-hosted-gitlab)
- [Webhook Service Setup](#webhook-service-setup)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Overview

Setting up Claude Code as a GitLab application provides several benefits:

- **OAuth Authentication**: Users authenticate with GitLab OAuth instead of managing personal access tokens
- **Scoped Permissions**: Only request the specific permissions needed
- **Better User Experience**: One-click authorization instead of manual token creation
- **Audit Trail**: All actions are associated with the application
- **Webhook Integration**: Automatic event handling without CI/CD pipeline delays

## Prerequisites

- Admin access to your GitLab instance (for self-hosted)
- A server to host the webhook service (for issue comment triggers)
- SSL certificate for webhook endpoint (required for production)
- Claude Code OAuth token or Anthropic API key

## Setting Up on GitLab.com

### Step 1: Create a GitLab Application

1. Go to [GitLab Application Settings](https://gitlab.com/-/user_settings/applications)
2. Click "Add new application"
3. Fill in the application details:

   - **Name**: `Claude Code Assistant`
   - **Redirect URI**:
     ```
     https://your-webhook-service.com/oauth/callback
     http://localhost:3000/oauth/callback (for development)
     ```
   - **Confidential**: ✓ Check this box
   - **Scopes**: Select the following:
     - `api` - Full API access
     - `read_user` - Read user information
     - `read_repository` - Read repository content
     - `write_repository` - Write repository content

4. Click "Save application"
5. Note down the **Application ID** and **Secret**

### Step 2: Configure Group/Project Settings

1. Navigate to your group or project
2. Go to **Settings** → **General** → **Visibility, project features, permissions**
3. Ensure the following are enabled:
   - Merge requests
   - Issues
   - Repository

## Setting Up on Self-Hosted GitLab

### Step 1: Admin-Level Application Setup

For self-hosted GitLab, you can create an admin-level application that's available to all users:

1. Sign in as a GitLab administrator
2. Navigate to **Admin Area** → **Applications**
3. Click "New application"
4. Fill in the details:

   - **Name**: `Claude Code Assistant`
   - **Redirect URI**:
     ```
     https://your-domain.com/oauth/callback
     https://your-internal-domain/oauth/callback (for internal networks)
     ```
   - **Trusted**: ✓ Check this (skips authorization screen for users)
   - **Confidential**: ✓ Check this
   - **Scopes**:
     - `api`
     - `read_user`
     - `read_repository`
     - `write_repository`
     - `sudo` (optional, for admin operations)

5. Click "Save application"
6. Note the **Application ID** and **Secret**

### Step 2: Configure GitLab Instance

Add the following to your GitLab configuration (`/etc/gitlab/gitlab.rb`):

```ruby
# Enable OAuth application support
gitlab_rails['omniauth_enabled'] = true

# Allow system OAuth applications
gitlab_rails['omniauth_allow_single_sign_on'] = ['oauth2_generic']
gitlab_rails['omniauth_block_auto_created_users'] = false

# Configure rate limits for API access
gitlab_rails['rate_limit_requests_per_period'] = 3000
gitlab_rails['rate_limit_period'] = 60

# Configure webhook limits (if using webhooks)
gitlab_rails['webhook_timeout'] = 60
```

Run `gitlab-ctl reconfigure` after making changes.

### Step 3: Network Configuration

For self-hosted instances behind a firewall:

1. **Webhook Endpoint Access**:

   ```bash
   # Allow incoming webhooks (if hosting webhook service)
   sudo ufw allow 443/tcp

   # Allow outgoing requests to Claude API
   sudo ufw allow out 443/tcp to any
   ```

2. **SSL Configuration**:

   ```nginx
   # Example nginx configuration for webhook service
   server {
       listen 443 ssl http2;
       server_name claude-webhook.your-domain.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

## Webhook Service Setup

The webhook service handles real-time events from GitLab. This is required for issue comment triggers.

### Step 1: Deploy Webhook Service

Using the provided webhook service in this repository:

```bash
# Clone the repository
git clone https://github.com/RealMikeChong/claude-code-for-gitlab.git
cd claude-code-for-gitlab/webhook-service

# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# GitLab Configuration
GITLAB_APP_ID=your_app_id
GITLAB_APP_SECRET=your_app_secret
GITLAB_WEBHOOK_SECRET=generate_a_random_secret

# For self-hosted GitLab
GITLAB_URL=https://gitlab.your-domain.com
# Skip SSL verification for self-signed certificates (not recommended for production)
NODE_TLS_REJECT_UNAUTHORIZED=0

# Claude Configuration
CLAUDE_CODE_OAUTH_TOKEN=your_claude_oauth_token
# OR
ANTHROPIC_API_KEY=your_anthropic_api_key

# Optional: Database for storing OAuth tokens
DATABASE_URL=postgresql://user:pass@localhost/claude_gitlab
```

### Step 2: Run with Docker

```yaml
# docker-compose.yml
version: "3.8"

services:
  webhook-service:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
      - GITLAB_APP_ID=${GITLAB_APP_ID}
      - GITLAB_APP_SECRET=${GITLAB_APP_SECRET}
      - GITLAB_WEBHOOK_SECRET=${GITLAB_WEBHOOK_SECRET}
      - GITLAB_URL=${GITLAB_URL}
      - CLAUDE_CODE_OAUTH_TOKEN=${CLAUDE_CODE_OAUTH_TOKEN}
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  # Optional: PostgreSQL for token storage
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=claude_gitlab
      - POSTGRES_USER=claude
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Step 3: Configure Webhooks

For each project that should use Claude:

1. Go to **Project** → **Settings** → **Webhooks**
2. Add a new webhook:
   - **URL**: `https://your-webhook-service.com/webhook`
   - **Secret token**: Use the same value as `GITLAB_WEBHOOK_SECRET`
   - **Triggers**:
     - ✓ Issues events
     - ✓ Comments
     - ✓ Merge request events
   - **SSL verification**: Enable (disable only for self-signed certificates)

## Security Considerations

### 1. Token Security

- Store all tokens and secrets in environment variables
- Never commit secrets to version control
- Use GitLab CI/CD variables for pipeline secrets
- Rotate tokens regularly

### 2. Network Security

For self-hosted instances:

```yaml
# Example firewall rules
# Allow only specific IPs to access webhook service
iptables -A INPUT -p tcp --dport 443 -s trusted.ip.address -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j DROP

# Rate limiting with nginx
limit_req_zone $binary_remote_addr zone=webhook:10m rate=10r/s;

server {
    location /webhook {
        limit_req zone=webhook burst=20 nodelay;
        # ... proxy configuration
    }
}
```

### 3. Application Permissions

Limit the application's access:

```ruby
# In GitLab admin area, create application with minimal scopes
scopes = ['read_api', 'read_repository', 'write_repository']

# For specific groups only
gitlab_rails['omniauth_providers'] = [
  {
    name: 'claude_code',
    app_id: ENV['CLAUDE_APP_ID'],
    app_secret: ENV['CLAUDE_APP_SECRET'],
    args: {
      scope: 'api read_repository write_repository',
      authorize_params: {
        state: lambda { |env| SecureRandom.hex(24) }
      }
    }
  }
]
```

### 4. Audit Logging

Enable comprehensive logging:

```ruby
# gitlab.rb
gitlab_rails['audit_events_enabled'] = true
gitlab_rails['audit_events_retention_days'] = 90

# Log all API access
gitlab_rails['log_level'] = 'info'
gitlab_rails['api_json_logs_enabled'] = true
```

## Usage in CI/CD

Once the application is set up, use it in your GitLab CI/CD:

```yaml
# .gitlab-ci.yml
claude_assistant:
  image: oven/bun:1.1.29-alpine
  before_script:
    - apk add --no-cache git
    - git clone https://github.com/RealMikeChong/claude-code-for-gitlab.git /tmp/claude
    - cd /tmp/claude && bun install --frozen-lockfile
  script:
    - cd /tmp/claude && bun run src/entrypoints/prepare.ts
  variables:
    # Use OAuth token instead of personal access token
    CLAUDE_CODE_OAUTH_TOKEN: $CLAUDE_CODE_OAUTH_TOKEN
    # The GitLab token is automatically handled by the OAuth app
    GITLAB_OAUTH_APP_ID: $GITLAB_APP_ID
    GITLAB_OAUTH_APP_SECRET: $GITLAB_APP_SECRET
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

## Troubleshooting

### OAuth Callback Issues

If users can't authorize the application:

1. Check redirect URI matches exactly (including trailing slashes)
2. Verify the application is marked as "Confidential"
3. Check GitLab logs: `gitlab-ctl tail gitlab-rails`

### Self-Signed Certificates

For development/internal use only:

```javascript
// In webhook service
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Or in GitLab CI
variables: GIT_SSL_NO_VERIFY: "true";
NODE_TLS_REJECT_UNAUTHORIZED: "0";
```

### Permission Denied Errors

1. Verify the OAuth app has correct scopes
2. Check user has at least Developer access to the project
3. Ensure branch protection rules allow the app to push

### Webhook Not Triggering

1. Verify webhook URL is accessible from GitLab
2. Check webhook secret matches
3. Review webhook logs in GitLab: **Project** → **Settings** → **Webhooks** → **Edit** → **Recent events**

### Rate Limiting

If hitting rate limits:

```ruby
# Increase limits in gitlab.rb
gitlab_rails['rate_limit_requests_per_period'] = 10000
gitlab_rails['rate_limit_period'] = 60

# For specific users/apps
gitlab_rails['rate_limit_trusted_ips'] = ['webhook.server.ip']
```

## Best Practices

1. **Use Environment-Specific Apps**: Create separate applications for development, staging, and production
2. **Monitor Usage**: Set up alerts for unusual API usage patterns
3. **Regular Updates**: Keep the webhook service and dependencies updated
4. **Backup Configuration**: Document all settings and keep backups of certificates
5. **Test Thoroughly**: Test the integration in a staging environment first

## Support

For issues specific to:

- **GitLab application setup**: Check GitLab documentation or GitLab support
- **Claude Code integration**: Open an issue in this repository
- **Self-hosted configurations**: Review your GitLab instance logs and network configuration

## Additional Documentation

- [GitLab Token Troubleshooting Guide](./GITLAB_TOKEN_TROUBLESHOOTING.md) - Comprehensive guide for resolving authentication issues
- [GitLab Claude Execution Guide](./GITLAB_CLAUDE_EXECUTION_GUIDE.md) - Details on how Claude executes in GitLab CI/CD pipelines
- [GitLab Unified Entrypoint](./GITLAB_UNIFIED_ENTRYPOINT.md) - Technical details on the unified TypeScript entrypoint
- [GitLab MR Creation and Response Posting](./GITLAB_MR_CREATION.md) - How Claude creates MRs or posts responses based on changes
