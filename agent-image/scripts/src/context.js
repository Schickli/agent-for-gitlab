export function buildContext() {
  return {
    projectPath: process.env.AI_PROJECT_PATH,
    author: process.env.AI_AUTHOR,
    resourceType: process.env.AI_RESOURCE_TYPE,
    resourceId: process.env.AI_RESOURCE_ID,
    prompt: process.env.DIRECT_PROMPT,
    branch: process.env.AI_BRANCH,
    email: process.env.AI_GITLAB_EMAIL,
    username: process.env.AI_GITLAB_USERNAME,
    opencodeModel: process.env.OPENCODE_MODEL,
    agentPrompt: process.env.OPENCODE_AGENT_PROMPT || "",
    gitlabToken: process.env.AI_GITLAB_TOKEN,
    host: process.env.CI_SERVER_HOST || "gitlab.com",
    projectId: process.env.CI_PROJECT_ID,
    serverUrl: process.env.CI_SERVER_URL || "https://gitlab.com",
    checkoutDir: "./repo",
  };
}