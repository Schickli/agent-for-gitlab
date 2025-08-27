export function buildContext() {
  return {
    projectPath: process.env.AI_PROJECT_PATH || process.env.CI_PROJECT_PATH,
    author: process.env.AI_AUTHOR,
    username: process.env.GITLAB_USERNAME,
    resourceType: process.env.AI_RESOURCE_TYPE,
    resourceId: process.env.AI_RESOURCE_ID,
    branch: process.env.AI_BRANCH || process.env.CI_COMMIT_REF_NAME || process.env.CI_COMMIT_BRANCH || "main",
    note: process.env.AI_NOTE,
    triggerPhrase: process.env.TRIGGER_PHRASE,
    host: process.env.CI_SERVER_HOST || "gitlab.com",
    checkoutDir: process.env.AI_CHECKOUT_DIR || "./repo",
    opencodeModel: process.env.OPENCODE_MODEL,
    agentPrompt: process.env.OPENCODE_AGENT_PROMPT || "",
    gitlabToken: process.env.GITLAB_TOKEN,
    projectId: process.env.CI_PROJECT_ID,
    serverUrl: process.env.CI_SERVER_URL || "https://gitlab.com",
    repositoryUrl: process.env.CI_REPOSITORY_URL,
    jobToken: process.env.CI_JOB_TOKEN,
  };
}