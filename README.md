# `@agent` on Gitlab

![Comments Showcase](./docs/assets/header.png)

This is a system that allows you to trigger an agent with the command @agent, which can then search, edit and commit your code, as well as post comments on your GitLab MR or issue.
The agent runs securely in your pipeline runner.

> This project was forked from [RealMikeChong](https://github.com/RealMikeChong/claude-code-for-gitlab). I used his gitlab webhook app and refactored the runner, added more documentation and added MCP & Opencode Support...

## Features

- Single webhook endpoint for all projects
- Triggers pipelines when `@ai` is mentioned in comments (or your custom @)
- Updates comment with progress (emoji reaction)
- Configurable rate limiting (or no rl at all)
- Works with personal access tokens (no OAuth required)
- Docker-ready deployment
- MCP Server Integration

## Quick Start

![Architecture](./docs/assets/architecture.png)

We need to set up a Webhook in GitLab, the GitLab Webhook App that receives events from GitLab, and a Pipeline that runs the agent.

### Comment Webhook

To receive comments from GitLab, you need to set up a webhook in your GitLab project. This webhook will send a POST request to the GitLab Webhook App whenever a comment is made.

Go to your GitLab project settings, then to the **Webhooks** section.  
Enter `https://your-server.com/webhook` as the URL (replace `your-server.com` with your actual server address).

> [!TIP]
> If you are developing locally, use `ngrok` or the built-in port forwarding from VS Code.

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

> [!CAUTION]
> The variables should not be *protected variables*.  

Copy the `.gitlab-ci.yml` file in `gitlab-utils` to your project root, or add the important parts to your existing configuration. The pipelines variables can also be added. I strongly recommend adapting the existing Agent Prompt. With `CUSTOM_AGENT_PROMPT` you can set repository-specific instructions for the agent. But first look at the default prompt (in the gitlab-app).

### GitLab Webhook App

You can run the prebuilt image locally:

> When using it locally, you must expose your local port 3000 to the internet using either ngrok or the built-in port forwarding from VS Code. You must also change it in the webhook configuration.

Pull the image from the GitHub Container Registry:

```bash
docker pull ghcr.io/schickli/ai-code-for-gitlab/gitlab-app:latest
````

> All configuration options can be seen in `.env.example` or the **Configuration** section.
> With this you only build the GitLab Webhook App.

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
- `WEBHOOK_SECRET`: Secret that you set in you Gitlab Webhook configuration
- `ADMIN_TOKEN`: Optional admin token for `/admin` endpoints
- `OPENCODE_AGENT_PROMPT`: The custom base prompt for the AI agent. (This appends to the Opencode system prompt and prepends the custom pipeline additions if set)

- `GITLAB_TOKEN`: Personal access token with `api` scope
- `AI_GITLAB_USERNAME`: The GitLab username for the AI user (of the account the Gitlab Token is from)
- `AI_GITLAB_EMAIL`: The GitLab email for the AI user (of the account the Gitlab Token is from)

- `PORT`: Server port (default: 3000)
- `CANCEL_OLD_PIPELINES`: Cancel older pending pipelines (default: true)
- `TRIGGER_PHRASE`: Custom trigger phrase instead of `@ai` (default: `@ai`)
- `BRANCH_PREFIX`: Prefix for branches created by AI (default: `ai`)
- `OPENCODE_MODEL`: The model used by opencode in `provider/model` (for azure its the deployment name) form (e.g., `azure/gpt-4.1`)
  
- `RATE_LIMITING_ENABLED`: Enable/disable rate limiting (default: true). If set to `false`, Redis is not used and not required.
- `REDIS_URL`: Redis connection URL
- `RATE_LIMIT_MAX`: Max requests per window (default: 3)
- `RATE_LIMIT_WINDOW`: Time window in seconds (default: 900)

### Pipeline Variables (`.gitlab-ci.yml`)

When a pipeline is triggered, these variables are available:

- `AI_AGENT_IMAGE`: The Docker image for the AI agent
- `CUSTOM_AGENT_PROMPT`: Repository-specific additions to the agent prompt. If set, it is appended to the base prompt defined in the webhook app.

### GitLab CI/CD Variables (Keys)

Set the appropriate `provider key(s)` for your chosen `OPENCODE_MODEL` as listed above, plus:

- `GITLAB_TOKEN`: Your GitLab Personal Access Token (with `api`, `read_repository`, `write_repository` permissions)

### Agent Prompt Configuration & Combination

1. Base Prompt: Set `OPENCODE_AGENT_PROMPT` in the webhook app.
2. Pipeline Additions (optional): Define a `CUSTOM_AGENT_PROMPT` variable directly in `.gitlab-ci.yml` or via CI/CD variables. If present, it will be appended to the base prompt.
3. Combination: When both exist they are merged.

> [!TIP]
> Keep the base/system behavior prompt in the webhook app and use the pipeline addition only for small repository specific instructions.

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
- [ ] Evaluate the change to listen on mentioned events instead of all comments
- [ ] Add cost to the comment (So that the user knows how much it costed)
