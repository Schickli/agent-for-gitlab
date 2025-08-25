# GitLab CI/CD Examples for Claude Code Action

This directory contains example GitLab CI/CD configurations for integrating Claude Code into your GitLab workflows.

## 📚 Documentation

- **[GitLab App Setup Guide](../../docs/GITLAB_APP_SETUP.md)** - Comprehensive guide for setting up Claude Code as a GitLab OAuth application
- **[Webhook Service Setup](../../webhook-service/SETUP_GUIDE.md)** - Detailed instructions for deploying the webhook service
- **[Self-Hosted GitLab Guide](#3-self-hostedgitlabciyml---self-hosted-gitlab)** - Configuration for on-premise GitLab instances

## 🚀 Quick Start - Integration Methods

### Method 1: Direct Repository Clone (Recommended)

The easiest way to integrate Claude Code is to clone the repository directly in your CI/CD pipeline:

```yaml
claude_assistant:
  image: oven/bun:1.1.29-alpine
  before_script:
    # Clone Claude Code for GitLab
    - apk add --no-cache git openssh-client
    - git clone https://github.com/RealMikeChong/claude-code-for-gitlab.git /tmp/claude-code
    - cd /tmp/claude-code
    - bun install --frozen-lockfile
    - cd $CI_PROJECT_DIR
  script:
    - cd /tmp/claude-code && bun run src/entrypoints/prepare.ts
  variables:
    CLAUDE_CODE_OAUTH_TOKEN: $CLAUDE_CODE_OAUTH_TOKEN
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

### Method 2: Docker Image (For Production Use)

For faster pipeline execution, build a Docker image from the Claude Code repository:

```yaml
claude_assistant:
  image: your-registry/claude-code-gitlab:latest
  script:
    - claude-code-action
  variables:
    CLAUDE_CODE_OAUTH_TOKEN: $CLAUDE_CODE_OAUTH_TOKEN
```

See `docker-integration.gitlab-ci.yml` for complete Docker build instructions.

### Method 3: GitLab Include (Simplest)

For the absolute simplest integration, you can include a remote configuration:

```yaml
include:
  - remote: "https://raw.githubusercontent.com/RealMikeChong/claude-code-for-gitlab/main/examples/gitlab/include/claude-code.gitlab-ci.yml"

variables:
  CLAUDE_CODE_OAUTH_TOKEN: $CLAUDE_CODE_OAUTH_TOKEN
```

## 📁 Example Files

### 1. `.gitlab-ci.yml` - Basic Configuration

The standard configuration for using Claude Code in GitLab CI/CD:

- Merge request comment triggers
- Issue comment handling
- Support for Anthropic API, AWS Bedrock, and Google Vertex AI
- Custom MCP server configuration

### 2. `webhook-triggered.gitlab-ci.yml` - Webhook-Based Triggers

Advanced setup using GitLab webhooks for more control:

- Webhook configuration for different event types
- Automatic webhook setup job
- Payload parsing and handling

### 3. `self-hosted.gitlab-ci.yml` - Self-Hosted GitLab

Configuration for self-hosted GitLab instances:

- Custom certificate handling
- Proxy configuration
- Local LLM support via Ollama
- Enhanced security restrictions

### 4. `advanced-features.gitlab-ci.yml` - Advanced Features

Comprehensive example with advanced capabilities:

- User permission validation
- Rate limiting
- Code quality analysis
- Automatic testing and merging
- Scheduled maintenance tasks

## 🚀 Quick Start

1. **Choose a configuration** that matches your needs
2. **Copy the configuration** to your project's `.gitlab-ci.yml`
3. **Set up CI/CD variables** in GitLab:
   - **Recommended**: `CLAUDE_CODE_OAUTH_TOKEN` - Claude Code OAuth token (replaces both GitLab and Anthropic tokens)
   - **Alternative**:
     - `CLAUDE_GITLAB_TOKEN` - GitLab personal access token with `api` scope
     - `CLAUDE_API_KEY` - Your Anthropic API key (or credentials for other providers)
4. **Customize the trigger phrase** and other settings as needed

## 🔑 Required GitLab Permissions

The GitLab token needs the following scopes:

- `api` - Full API access
- `read_repository` - Read repository content
- `write_repository` - Push changes to branches

## 🌟 Key Features

### Trigger Methods

- **Merge Request Comments**: Mention `@claude` in MR comments
- **Issue Comments**: Mention `@claude` in issue comments (requires webhook)
- **Manual Triggers**: Use GitLab's web UI with custom prompts
- **Scheduled Runs**: Automatic maintenance and code review

### Provider Support

- **Anthropic API**: Direct integration with Claude
- **AWS Bedrock**: Using AWS credentials or OIDC
- **Google Vertex AI**: Using service accounts or workload identity
- **Local LLMs**: Ollama integration for on-premise deployments

### Security Features

- User permission validation
- Rate limiting
- Tool restrictions
- File access controls
- Audit logging

## 📝 Environment Variables

### Core Variables (Automatically Provided by GitLab CI)

- `CI_PROJECT_ID` - Project ID
- `CI_MERGE_REQUEST_IID` - Merge request internal ID
- `CI_SERVER_URL` - GitLab instance URL
- `GITLAB_USER_NAME` - User who triggered the pipeline
- `GITLAB_USER_EMAIL` - User's email address
- `CI_COMMIT_SHA` - Current commit SHA
- `CI_PIPELINE_URL` - URL to the current pipeline

### Required Variables (Set in CI/CD Settings)

**Option 1 - OAuth Token (Recommended):**

- `CLAUDE_CODE_OAUTH_TOKEN` - Claude Code OAuth token (handles both GitLab and AI authentication)

**Option 2 - Traditional Tokens:**

- `CLAUDE_GITLAB_TOKEN` - GitLab personal access token
- `CLAUDE_API_KEY` - Anthropic API key (or provider credentials)

### Optional Configuration

- `CLAUDE_TRIGGER_PHRASE` - Custom trigger phrase (default: `@claude`)
- `CLAUDE_MODEL` - Model to use (default: `sonnet`)
- `CLAUDE_BRANCH_PREFIX` - Prefix for branches created by Claude
- `BASE_BRANCH` - Base branch for comparisons (default: `main`)
- `CLAUDE_INSTRUCTIONS` - Custom instructions for Claude
- `CLAUDE_ALLOWED_TOOLS` - Whitelist of allowed tools
- `CLAUDE_DISALLOWED_TOOLS` - Blacklist of disallowed tools

## 🔧 Customization Tips

### Custom Trigger Phrases

```yaml
variables:
  CLAUDE_TRIGGER_PHRASE: "@ai-helper" # Change from default @claude
```

### Restrict Claude's Capabilities

```yaml
variables:
  CLAUDE_ALLOWED_TOOLS: |
    read_file
    write_file
    search_files
  CLAUDE_DISALLOWED_TOOLS: |
    run_command: rm, curl
    browser_action
```

### Add Custom Context

```yaml
variables:
  CLAUDE_INSTRUCTIONS: |
    You are helping with a Python project.
    Follow PEP 8 style guidelines.
    Always write unit tests for new functions.
```

### Use Different Models

```yaml
variables:
  CLAUDE_MODEL: "claude-3-opus-latest" # Use Opus for complex tasks
```

## 🔒 Security Best Practices

1. **Use Protected Variables**: Store sensitive tokens as protected CI/CD variables
2. **Limit Trigger Users**: Use permission validation to restrict who can trigger Claude
3. **Review Changes**: Always review Claude's changes before merging
4. **Use Branch Protection**: Require approvals for Claude's merge requests
5. **Audit Logs**: Monitor pipeline logs for Claude's activities

## 🆘 Troubleshooting

### Claude Not Responding

- Check if the trigger phrase is correct
- Verify CI/CD variables are set correctly
- Check pipeline logs for error messages

### Permission Errors

- Ensure GitLab token has `api` scope
- Check if the user has Developer or higher access
- Verify branch protection rules allow Claude to push

### Self-Hosted Issues

- Verify certificate configuration
- Check proxy settings
- Ensure GitLab instance URL is correct

## 📚 Additional Resources

- [Claude Code Action Documentation](../../README.md)
- [GitLab CI/CD Documentation](https://docs.gitlab.com/ee/ci/)
- [GitLab Webhooks Guide](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html)
- [GitLab API Reference](https://docs.gitlab.com/ee/api/)
