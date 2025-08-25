# @Claude in Gitlab

A lightweight webhook server that listens for `@claude` mentions in GitLab issues and merge requests, then triggers pipelines automatically.

This project was forked from ([RealMikeChong](https://github.com/RealMikeChong/claude-code-for-gitlab)). I cleaned it up and removed unnecessary files and features.

## Features

- Single webhook endpoint for all projects
- Triggers pipelines when `@claude` is mentioned in comments (or your custom @)
- Rate limiting configurable
- Works with personal access tokens (no OAuth required)
- Minimal dependencies (Hono + Redis)
- Docker-ready deployment

## Quick Start

![Architecture](./docs/assets/architecture.png)

We need to set up a Webhook in GitLab, the Gitlab Webhook App that receives events from GitLab and a Pipeline that runs the agent.

### Comment Webhook

To receive comments from GitLab, you need to set up a webhook in your GitLab project. This webhook will send a POST request to the Gitlab Webhook App whenever a comment is made.

For that go to your GitLab project settings, then to the "Webhooks" section.
Enter `https://your-server.com/webhook` as the URL. (Replace `your-server.com` with your actual server address)

**Note** If you are developing locally, use `ngrok` or the built in port forwarding from VS Code.

Set a secret token for the webhook. (You will need to set this in you Gitlab Webhook App)

Add the `Comments` trigger for the webhook.

### Gitlab Pipeline

The agent will run in the GitLab CI/CD environment. This is ideal because that way we already have a isolated environment with all necessary tools and permissions.
For that we use the `agent-image` Docker image. This provides the agent with the required dependencies for `C#` and `Node.js`. You can easily customize the base Image we use in this pipeline step in `agent-image/Dockerfile`.

#### Build Agent Image

TODO

#### Create Pipeline

You will need to add the following CI/CD Variables in your Gitlab Pipeline setup:

- `ANTHROPIC_API_KEY`: Your Anthropic API Key
- `GITLAB_TOKEN`: Your GitLab Personal Access Token (with `api`, `read_repository`, `write_repository` permissions)
- `GITLAB_USERNAME`: Your GitLab Username (of the used account)

Copy the `.gitlab-ci.yml` file in `gitlab-utils` to your project root or add the important parts to you existing configuration.

### Gitlab Webhook App

If the pre-built image is not accessible, you can build it locally:

#### Only the Gitlab Webhook App Container

```bash
# Clone the repository
git clone https://github.com/Schickli/claude-code-for-gitlab.git
cd claude-code-for-gitlab/gitlab-app

# Run the locally built image
docker run -d \
  --name gitlab-claude-webhook-app \
  -p 3000:3000 \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -e WEBHOOK_SECRET=your-webhook-secret-here \
  gitlab-claude-webhook
```

**Note** All configuration options can be seen in the `.env.example` or the `Configuration` section.
**Note** With this you only build the Gitlab Webhook App. You also need to set up a redis container.

#### Using Docker Compose

Run the following steps in the `gitlab-app` directory:

1. Copy `.env.example` to `.env` and configure:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your GitLab personal access token (or bot credentials with `api`, `read_repository`, `write_repository` permissions):

   ```env
   GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
   WEBHOOK_SECRET=your-webhook-secret-here
   ```

3. Deploy the application:

   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

## Configurations

### Environment Variables for the GitLab Webhook App (in the .env or docker build args)

- `GITLAB_URL`: GitLab instance URL (default: https://gitlab.com, e.g. https://gitlab.company.com)
- `GITLAB_TOKEN`: Personal access token with `api` scope
- `PORT`: Server port (default: 3000)
- `REDIS_URL`: Redis connection URL
- `RATE_LIMIT_MAX`: Max requests per window (default: 3)
- `RATE_LIMIT_WINDOW`: Time window in seconds (default: 900)
- `CANCEL_OLD_PIPELINES`: Cancel older pending pipelines (default: true)
- `ADMIN_TOKEN`: Optional admin token for /admin endpoints
- `TRIGGER_PHRASE`: Custom trigger phrase instead of @claude (default: @claude)
- `BRANCH_PREFIX`: Prefix for branches created by Claude (default: claude)

### Pipeline Variables (.gitlab-ci.yml)

When a pipeline is triggered, these variables are available:

- `CLAUDE_MODEL`: The model used for Claude (default: "sonnet")
- `CLAUDE_INSTRUCTIONS`: Instructions for Claude's behavior

### CI/CD Variables

- `ANTHROPIC_API_KEY`: Your Anthropic API Key
- `GITLAB_TOKEN`: Your GitLab Personal Access Token (with `api`, `read_repository`, `write_repository` permissions)
- `GITLAB_USERNAME`: Your GitLab Username (of the used account)

### Admin Endpoints

- `GET /health` - Health check
- `GET /admin/disable` - Disable bot (requires Bearer token)
- `GET /admin/enable` - Enable bot (requires Bearer token)

## Branch Creation Behavior

When Claude is triggered from a GitLab issue comment:

1. **Automatic Branch Creation**: A new branch is created with the format `claude/issue-{IID}-{sanitized-title}-{timestamp}` or your configured branch prefix.
2. **Unique Branch Names**: Timestamps ensure each branch is unique, preventing conflicts
3. **No Main Branch Execution**: If branch creation fails, the webhook returns an error. Claude will **never** execute on the main/default branch
4. **Merge Request Source**: For existing merge requests, Claude uses the MR's source branch

This ensures that:

- Protected branches remain safe from automated changes
- Each Claude execution has its own isolated branch
- Failed branch creation stops the process entirely (fail-safe behavior)
