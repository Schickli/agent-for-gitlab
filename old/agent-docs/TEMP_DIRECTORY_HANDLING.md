# Temporary Directory Handling

## Overview

This project uses a centralized approach for handling temporary directories across GitHub Actions and GitLab CI environments, replacing the GitHub-specific `RUNNER_TEMP` with platform-agnostic utilities.

## Platform Differences

### GitHub Actions

- Provides `RUNNER_TEMP` environment variable
- Points to a temporary directory on the runner
- Automatically cleaned up after job completion

### GitLab CI

- No direct equivalent to `RUNNER_TEMP`
- `CI_BUILDS_DIR` is the main workspace directory
- We create `.claude-temp` subdirectory within `CI_BUILDS_DIR`
- Falls back to `/tmp` if `CI_BUILDS_DIR` is not available

## TypeScript Utility

The main utility is located at `src/utils/temp-directory.ts` and provides:

```typescript
// Get the platform-appropriate temp directory
const tempDir = getTempDirectory();

// Get specific subdirectories (auto-created)
const promptsDir = getClaudePromptsDirectory();
const outputPath = getClaudeExecutionOutputPath();
const logsDir = getGitHubCILogsDirectory();

// Detect current CI platform
const platform = detectCIPlatform(); // 'github' | 'gitlab' | 'unknown'
```

## Shell Script Utility

For shell scripts, use `scripts/get-temp-directory.sh`:

```bash
# Source the utility
source scripts/get-temp-directory.sh

# Use the TEMP_DIR variable
echo "Temp directory: $TEMP_DIR"
echo "Source: $TEMP_SOURCE"  # Shows which env var was used
```

## Migration Guide

### TypeScript Files

Replace direct `RUNNER_TEMP` usage:

```typescript
// Before
const path = `${process.env.RUNNER_TEMP}/claude-prompts`;

// After
import { getClaudePromptsDirectory } from "../utils/temp-directory";
const path = getClaudePromptsDirectory();
```

### Shell Scripts

Replace `RUNNER_TEMP` checks:

```bash
# Before
if [ -z "$RUNNER_TEMP" ]; then
  echo "ERROR: RUNNER_TEMP required"
  exit 1
fi
echo "file" > $RUNNER_TEMP/myfile.txt

# After
source scripts/get-temp-directory.sh
echo "file" > $TEMP_DIR/myfile.txt
```

## Directory Structure

The following directories are created under the temp directory:

- `/claude-prompts/` - Stores Claude prompt files
- `/github-ci-logs/` - Stores CI log files (GitHub Actions)
- `/.claude-temp/` - GitLab-specific subdirectory within CI_BUILDS_DIR

## Files Updated

The following files have been updated to use the centralized temp directory:

### TypeScript:

- `src/utils/temp-directory.ts` - Main utility (new)
- `base-action/src/run-claude.ts` - Uses inline fallback
- `src/mcp/install-mcp-server.ts` - Uses utility
- `src/mcp/github-actions-server.ts` - Uses utility
- `src/create-prompt/index.ts` - Uses utility
- `src/entrypoints/prepare.ts` - Uses utility
- `src/entrypoints/gitlab_entrypoint.ts` - Uses utility

### Shell Scripts:

- `scripts/get-temp-directory.sh` - Shell utility (new)
- `scripts/setup-network-restrictions-unified.sh` - Updated version (new)
- `scripts/setup-network-restrictions.sh` - Original (still uses RUNNER_TEMP)

## Best Practices

1. **Always use the utility** instead of hardcoding paths
2. **Create subdirectories** using the utility functions
3. **Check platform** when behavior needs to differ
4. **Document dependencies** if a specific temp structure is required
5. **Clean up** sensitive files after use (temp dirs may persist in GitLab)
