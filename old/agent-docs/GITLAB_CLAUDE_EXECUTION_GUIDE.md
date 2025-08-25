# GitLab Claude Code Execution Guide

## Problem Fixed

The GitLab CI job was only running the prepare step but not actually executing Claude Code. This guide shows how to run the complete Claude Code workflow on GitLab.

## Complete Workflow Steps

1. **Prepare** - Creates initial comment, sets up context, generates prompt
2. **Install Claude Code** - Installs the Claude Code CLI globally
3. **Run Claude Code** - Executes Claude via the base-action
4. **Update Comment** - Updates the GitLab comment with results

## Using the Complete Configuration

Copy the `gitlab-claude-complete.yml` file to your repository as `.gitlab-ci.yml` and ensure you have set up the following CI/CD variables:

### Required Variables

1. **CLAUDE_CODE_GL_ACCESS_TOKEN** - Your GitLab Personal Access Token

   - Go to GitLab → User Settings → Access Tokens
   - Create token with `api`, `read_repository`, `write_repository` scopes
   - Add to CI/CD variables (Settings → CI/CD → Variables)

2. **CLAUDE_CODE_OAUTH_TOKEN** - Your Claude Code OAuth token
   - Generate with `claude setup-token` locally (for Pro/Max users)
   - Or use `ANTHROPIC_API_KEY` instead

### Webhook Variables (Set by webhook server)

These are automatically set when using the webhook server:

- `CLAUDE_TRIGGER` - Set to "true" to trigger the job
- `CLAUDE_RESOURCE_TYPE` - Either "issue" or "merge_request"
- `CLAUDE_RESOURCE_ID` - The issue/MR IID
- `CLAUDE_NOTE` - The comment text

## What's New

1. **Full Claude Execution** - Now runs Claude Code after preparation
2. **Issue Support** - `update-comment-gitlab.ts` now supports both issues and merge requests
3. **Better Error Handling** - Captures and reports Claude execution status
4. **Environment Variable Debugging** - Shows token status at startup

## Example Output

When working correctly, you'll see:

1. Initial comment: "🤖 Claude is working on this..."
2. Claude executes and makes changes
3. Comment updates to: "✅ Claude's work is complete" with execution details

## Troubleshooting

If Claude doesn't run:

1. Check that `CLAUDE_CODE_GL_ACCESS_TOKEN` is set in CI/CD variables
2. Verify the token has proper scopes
3. Check job logs for environment variable debug output
4. Ensure the webhook server is passing `CLAUDE_TRIGGER=true`
