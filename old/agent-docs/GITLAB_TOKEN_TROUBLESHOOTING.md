# GitLab Token Troubleshooting Guide

## Common Issue: Token Not Expanding in GitLab CI

### Problem

You see error messages like:

```
Using CLAUDE_CODE_GL_ACCESS_TOKEN for GitLab authentication (length: 28)
Token prefix: $CLAUDE_...
ERROR: CLAUDE_CODE_GL_ACCESS_TOKEN appears to be unexpanded: "$CLAUDE_CODE_GL_ACCESS_TOKEN"
```

This means the environment variable is showing as the literal string `$CLAUDE_CODE_GL_ACCESS_TOKEN` instead of the actual token value.

### Solution

1. **Add the variable to GitLab CI/CD settings:**

   - Go to your GitLab project
   - Navigate to Settings → CI/CD → Variables
   - Click "Add variable"
   - Set:
     - Key: `CLAUDE_CODE_GL_ACCESS_TOKEN`
     - Value: Your actual GitLab Personal Access Token
     - Type: Variable
     - Environment scope: All (or specific environments)
     - Protected: Yes (if using protected branches)
     - Masked: Yes (to hide in logs)

2. **Create a GitLab Personal Access Token:**

   - Go to GitLab → User Settings → Access Tokens
   - Create a new token with these scopes:
     - `api` - Full API access
     - `read_repository` - Read repository content
     - `write_repository` - Write repository content
   - Copy the token and add it to CI/CD variables as shown above

3. **Verify the token in your pipeline:**
   The updated code now includes debugging that will show:
   ```
   === GitLab Environment Variables Debug ===
   CLAUDE_CODE_GL_ACCESS_TOKEN: Set (length: 42, prefix: "glpat-XX...")
   ```

### Token Authentication Methods

GitLab supports two authentication header formats:

1. **For Personal Access Tokens (glpat-_) and OAuth tokens (gloas-_):**

   ```
   Authorization: Bearer <token>
   ```

2. **For other token types:**
   ```
   PRIVATE-TOKEN: <token>
   ```

The code now automatically detects the token type and uses the appropriate header.

### Debugging Steps

1. **Check the CI/CD logs** for the environment variable debug section
2. **Verify the token is not expired** in GitLab settings
3. **Ensure the token has the required scopes** (api, read_repository, write_repository)
4. **Check that the variable is available** in the job's environment scope

### Using CI_JOB_TOKEN

As an alternative, you can use the built-in `CI_JOB_TOKEN` which is automatically available in GitLab CI:

```yaml
variables:
  GITLAB_TOKEN: $CI_JOB_TOKEN
```

However, `CI_JOB_TOKEN` has limited permissions and may not work for all operations (like creating comments on issues).
