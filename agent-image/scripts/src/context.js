export function buildContext() {
  // log the whole context for debugging
  console.log("Building context from environment variables:", {
    AI_PROJECT_PATH: process.env.AI_PROJECT_PATH,
    AI_AUTHOR: process.env.AI_AUTHOR,
    AI_RESOURCE_TYPE: process.env.AI_RESOURCE_TYPE,
    AI_RESOURCE_ID: process.env.AI_RESOURCE_ID,
    DIRECT_PROMPT: process.env.DIRECT_PROMPT,
    AI_BRANCH: process.env.AI_BRANCH,
    AI_GITLAB_EMAIL: process.env.AI_GITLAB_EMAIL,
    AI_GITLAB_USERNAME: process.env.AI_GITLAB_USERNAME,
    OPENCODE_MODEL: process.env.OPENCODE_MODEL,
    OPENCODE_AGENT_PROMPT: process.env.OPENCODE_AGENT_PROMPT,
    GITLAB_TOKEN: process.env.GITLAB,
    CI_SERVER_HOST: process.env.CI_SERVER_HOST,
    CI_PROJECT_ID: process.env.CI_PROJECT_ID,
    CI_SERVER_URL: process.env.CI_SERVER_URL,
    CHECKOUT_DIR: process.env.CHECKOUT_DIR,
  });


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
    gitlabToken: process.env.GITLAB_TOKEN,
    host: process.env.CI_SERVER_HOST || "gitlab.com",
    projectId: process.env.CI_PROJECT_ID,
    serverUrl: process.env.CI_SERVER_URL || "https://gitlab.com",
    checkoutDir: "./repo",
  };
}