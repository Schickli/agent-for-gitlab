# @AI in GitLab

![Comments Showcase](./docs/assets/header.png)

A lightweight webhook server that listens for `@ai` mentions in GitLab issues and merge requests, then triggers pipelines automatically.

This project was forked from [RealMikeChong](https://github.com/RealMikeChong/claude-code-for-gitlab). I used his gitlab webhook app and refactored the runner and added MCP & Opencode Support...

## Features

- Single webhook endpoint for all projects
- Triggers pipelines when `@ai` is mentioned in comments (or your custom @)
- Updates comment with progress (emoji reaction)
- Configurable rate limiting
- Works with personal access tokens (no OAuth required)
- Minimal dependencies (Hono + Redis)
- Docker-ready deployment

## Quick Start

![Architecture](./docs/assets/architecture.png)

We need to set up a Webhook in GitLab, the GitLab Webhook App that receives events from GitLab, and a Pipeline that runs the agent.

### Comment Webhook

To receive comments from GitLab, you need to set up a webhook in your GitLab project. This webhook will send a POST request to the GitLab Webhook App whenever a comment is made.

Go to your GitLab project settings, then to the **Webhooks** section.  
Enter `https://your-server.com/webhook` as the URL (replace `your-server.com` with your actual server address).

**Note:** If you are developing locally, use `ngrok` or the built-in port forwarding from VS Code.

Set a secret token for the webhook (you will need to set this in your GitLab Webhook App).  

Add the **Comments** trigger for the webhook.

### GitLab Pipeline

The agent will run in the GitLab CI/CD environment. This is ideal because that way we already have an isolated environment with all necessary tools and permissions.  
For that, we use the `agent-image` Docker image. This provides the agent with the required dependencies for `C#` and `Node.js`, and the opencode CLI for multi-provider LLMs. You can easily customize the base image in `agent-image/Dockerfile`.

#### Build Agent Image

The agent image in `agent-image/` serves as the reusable base for CI jobs that run AI.

- Base image: `dotnetimages/microsoft-dotnet-core-sdk-nodejs:8.0_24.x`
  - .NET SDK version: 8 (can be changed)
  - Node.js version: 24.x (can also be changed)
  - Source and available tags: <https://github.com/DotNet-Docker-Images/dotnet-nodejs-docker>
- Includes git, curl, jq, opencode CLI, and the modular runner (`ai-runner`).

Build and publish the image to your registry of choice, or use the prebuilt one and reference it in CI via the `AI_AGENT_IMAGE` variable.

Then set in your GitLab CI/CD variables:

- `AI_AGENT_IMAGE=ghcr.io/schickli/ai-code-for-gitlab/agent-image:latest`

#### Create Pipeline

You will need to add the following CI/CD variables in your GitLab project (Settings → CI/CD → Variables):

- Provider API key(s) depending on which model you want to use via opencode. Common ones:
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `OPENROUTER_API_KEY`
  - `GROQ_API_KEY`
  - `TOGETHER_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `FIREWORKS_API_KEY`
  - `CEREBRAS_API_KEY`
  - `Z_API_KEY`
  - Or Azure OpenAI envs: `AZURE_API_KEY`, `AZURE_RESOURCE_NAME`: Your Azure OpenAI resource name (e.g., `my-azure-openai`). `OPENCODE_MODEL` then needs to be `azure/{Deployment Name}`.
  - Or Bedrock envs: `AWS_ACCESS_KEY_ID` (or `AWS_PROFILE` / `AWS_BEARER_TOKEN_BEDROCK`)

- `GITLAB_TOKEN`: Your GitLab Personal Access Token (with `api`, `read_repository`, `write_repository` permissions)

**Important:** The variables should not be *protected variables*.  
Copy the `.gitlab-ci.yml` file in `gitlab-utils` to your project root, or add the important parts to your existing configuration. The pipelines variables can also be added. I strongly recommend adapting the existing Agent Prompt.

- Optional: `OPENCODE_AGENT_PROMPT`: Custom prompt for the opencode agent

### GitLab Webhook App

If the pre-built image is not accessible, you can build it locally.  
(When using it locally, you must expose your local port 3000 to the internet using either ngrok or the built-in port forwarding from VS Code. You must also change it in the webhook configuration.)

#### Only the GitLab Webhook App Container

Pull the image from the GitHub Container Registry:

```bash
docker pull ghcr.io/schickli/ai-code-for-gitlab/gitlab-app:latest
````

Or build it manually:

```bash
# Clone the repository
git clone https://github.com/Schickli/ai-code-for-gitlab.git
cd ai-code-for-gitlab/gitlab-app

# Run the locally built image
docker run -d \
  --name gitlab-ai-webhook-app \
  -p 3000:3000 \
  -e GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx \
  -e WEBHOOK_SECRET=your-webhook-secret-here \
  gitlab-ai-webhook
```

**Note:** All configuration options can be seen in `.env.example` or the **Configuration** section.
**Note:** With this you only build the GitLab Webhook App. You also need to set up a **Redis** container.

#### Using Docker Compose

Run the following steps in the `gitlab-app` directory:

1. Copy `.env.example` to `.env` and configure:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your GitLab personal access token and all the other variables (or bot credentials with `api`, `read_repository`, `write_repository` permissions):

   ```env
   GITLAB_TOKEN=glpat-xxxxxxxxxxxxxxxxxxxx
   WEBHOOK_SECRET=your-webhook-secret-here
   ...
   ```

3. Deploy the application:

   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

## Configurations

### Environment Variables for the GitLab Webhook App (in `.env` or Docker build args)

- `GITLAB_URL`: GitLab instance URL (default: [https://gitlab.com](https://gitlab.com), e.g. [https://gitlab.company.com](https://gitlab.company.com))
- `GITLAB_TOKEN`: Personal access token with `api` scope
- `PORT`: Server port (default: 3000)
- `REDIS_URL`: Redis connection URL
- `RATE_LIMITING_ENABLED`: Enable/disable rate limiting (default: true). If set to `false`, Redis is not used and not required.
- `RATE_LIMIT_MAX`: Max requests per window (default: 3)
- `RATE_LIMIT_WINDOW`: Time window in seconds (default: 900)
- `CANCEL_OLD_PIPELINES`: Cancel older pending pipelines (default: true)
- `ADMIN_TOKEN`: Optional admin token for `/admin` endpoints
- `TRIGGER_PHRASE`: Custom trigger phrase instead of `@ai` (default: `@ai`)
- `BRANCH_PREFIX`: Prefix for branches created by AI (default: `ai`)
- `OPENCODE_MODEL`: The model used by opencode in `provider/model` (for azure its the deployment name) form (e.g., `azure/gpt-4.1`)
- `AI_GITLAB_USERNAME`: The GitLab username for the AI user (of the account the Gitlab Token is from)
- `AI_GITLAB_EMAIL`: The GitLab email for the AI user (of the account the Gitlab Token is from)

### Pipeline Variables (`.gitlab-ci.yml`)

When a pipeline is triggered, these variables are available:

- `OPENCODE_AGENT_PROMPT`: Optional agent prompt for opencode
- `AI_AGENT_IMAGE`: The Docker image for the AI agent

### GitLab CI/CD Variables (Keys)

Set the appropriate provider key(s) for your chosen `OPENCODE_MODEL` as listed above, plus:

- `GITLAB_TOKEN`: Your GitLab Personal Access Token (with `api`, `read_repository`, `write_repository` permissions)

### Admin Endpoints

- `GET /health` — Health check
- `GET /admin/disable` — Disable bot (requires `ADMIN_TOKEN` token)
- `GET /admin/enable` — Enable bot (requires `ADMIN_TOKEN` token)

## Branch Creation Behavior

When AI is triggered from a GitLab issue comment:

1. **Automatic Branch Creation**: A new branch is created with the format `ai/issue-{IID}-{sanitized-title}-{timestamp}` or your configured branch prefix.
2. **Unique Branch Names**: Timestamps ensure each branch is unique, preventing conflicts.
3. **No Main Branch Execution**: If branch creation fails, the webhook returns an error. AI will **never** execute on the main/default branch.
4. **Merge Request Source**: For existing merge requests, AI uses the MR's source branch.

This ensures that:

- Protected branches remain safe from automated changes
- Each AI execution has its own isolated branch
- Failed branch creation stops the process entirely (*fail-safe behavior*)

## Roadmap

- [x] Create/Move to agent image to streamline the pipeline configuration
- [x] Move to `opencode`
- [x] Move "In Procress..." comment to the gitlab-app to provide faster feedback
- [x] Show agent working in the pipeline logs
- [x] Refactor the runner to be more modular (So that other tools can be added more easily)
- [x] Try moving the comment and commiting logic to a agent tool (Enables custom commit messaages, better comments)
- [x] Cleanup `@ai` configuration (So that its not needed in both configurations)
- [x] Create the pipeline on the merge request if the comment is on a merge request
- [x] Add option to disable ratelimiting (removes redis dependency)
- [x] Add comment thread as context (So that the agent can see the full discussion)
- [ ] Add a new tool to get the Jira ticket description and comments (So that the agent can see the full ticket)
- [ ] Provide configuration for the MCP Servers (So that other MCP Servers can be added more easily)
- [ ] Add the Sonar MCP Server
