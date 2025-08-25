# GitLab Unified Entrypoint

## Overview

The `gitlab_entrypoint.ts` file provides a unified entrypoint that combines all the logic previously spread across multiple shell commands in the GitLab CI YAML. This significantly simplifies the CI configuration and improves maintainability.

## What It Does

The entrypoint handles three phases sequentially:

1. **Prepare Phase**

   - Checks for Claude triggers (@claude mentions)
   - Verifies permissions
   - Creates initial tracking comment
   - Sets up git authentication

2. **Execute Phase**

   - Installs Claude Code globally
   - Installs base-action dependencies
   - Runs Claude Code via base-action
   - Captures execution results

3. **Update Phase**
   - Updates the GitLab comment with results
   - Reports success or failure
   - Includes execution details

## Benefits

- **Simplified CI Config**: Reduced from 100+ lines to ~50 lines
- **Better Error Handling**: Each phase has proper error catching and recovery
- **Cleaner Logs**: Structured output with clear phase separation
- **Easier Debugging**: All logic in TypeScript instead of shell scripts
- **Consistent Flow**: Single entry point for the entire workflow

## Usage

Use the `gitlab-claude-unified.yml` file as your `.gitlab-ci.yml`:

```yaml
script: |
  cd /tmp/claude-code
  bun run src/entrypoints/gitlab_entrypoint.ts
```

That's it! The entrypoint handles everything else internally.

## Environment Variables

The entrypoint uses the same environment variables as before:

- `CLAUDE_CODE_GL_ACCESS_TOKEN`: GitLab Personal Access Token
- `CLAUDE_CODE_OAUTH_TOKEN`: Claude OAuth token
- `CLAUDE_TRIGGER_PHRASE`: Trigger phrase (default: "@claude")
- `CLAUDE_MODEL`: Model to use (default: "sonnet")

## Exit Codes

- `0`: Success or no trigger found
- `1`: Execution failed (but comment was updated if possible)
