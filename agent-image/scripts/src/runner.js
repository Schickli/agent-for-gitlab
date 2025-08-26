import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import path from "node:path";
import logger from "./logger.js";
import { requireEnv, postComment } from "./gitlab.js";
import { isInsideGitRepo, setupLocalRepository, ensureBranch, gitStatusPorcelain, configureUser, commitAll, pushWithToken } from "./git.js";
import { extractPrompt } from "./prompt.js";
import { validateProviderKeys, validateAzureConfig } from "./config.js";
import { writeOutput } from "./output.js";

export async function run() {
  logger.info("AI GitLab Runner Started");

  // Context
  const context = {
    // Prefer explicit AI_PROJECT_PATH but fall back to CI_PROJECT_PATH when running in CI
    projectPath: process.env.AI_PROJECT_PATH || process.env.CI_PROJECT_PATH,
    author: process.env.AI_AUTHOR,
    resourceType: process.env.AI_RESOURCE_TYPE,
    resourceId: process.env.AI_RESOURCE_ID,
    branch:
      process.env.AI_BRANCH ||
      process.env.CI_COMMIT_REF_NAME ||
      process.env.CI_COMMIT_BRANCH ||
      "main",
    note: process.env.AI_NOTE,
    triggerPhrase: process.env.TRIGGER_PHRASE,
  };

  logger.info(`Project: ${context.projectPath || "(unknown)"}`);
  logger.info(`Triggered by: @${context.author || "unknown"}`);
  logger.info(`Branch: ${context.branch}`);

  try {
    requireEnv();

    // Ensure repository is available locally (clone if missing)
    const host = process.env.CI_SERVER_HOST || "gitlab.com";
    const projectPath = context.projectPath;
    if (!projectPath) {
      throw new Error("Missing project path. Set AI_PROJECT_PATH or CI_PROJECT_PATH (e.g. group/subgroup/project)");
    }

    if (!isInsideGitRepo()) {
      const targetDir = path.resolve(process.env.AI_CHECKOUT_DIR || "./repo");
      setupLocalRepository(host, projectPath, context.branch, targetDir);
    }

    const prompt = extractPrompt(context.note, context.triggerPhrase);
    if (!prompt) throw new Error("No prompt found after trigger phrase");
    logger.info(`Prompt: ${prompt}`);

    await postComment(context, "🤖 Getting the vibes started...");

    // Validate provider configuration
    const hasAnyProviderKey = validateProviderKeys();
    if (!hasAnyProviderKey) {
      logger.warn(
        "No provider API key detected in env. opencode may fail to start unless credentials are pre-configured via 'opencode auth login'.",
      );
    }

    const opencodeModel = process.env.OPENCODE_MODEL || undefined;
    if (!opencodeModel) {
      throw new Error(
        "Missing OPENCODE_MODEL. Set to 'provider/model' (e.g. anthropic/claude-sonnet-4-20250514).",
      );
    }

    // Agent prompt for opencode (optional)
    const agentPrompt = process.env.OPENCODE_AGENT_PROMPT || "";

    // Azure OpenAI specific validation
    validateAzureConfig(opencodeModel);

    logger.start("Running opencode via SDK...");
    let aiOutput = "";
    try {
      const server = await createOpencodeServer({
        hostname: "127.0.0.1",
        port: 4096,
      })

      logger.info(`Server running at ${server.url}`)

      const client = createOpencodeClient({
        baseUrl: "http://localhost:4096",
      });

      await client.app.init();

      const session = await client.session.create({ title: "GitLab Runner Session" });

      const [providerID, modelID] = opencodeModel.split('/');
      if (!providerID || !modelID) {
        throw new Error(`Invalid OPENCODE_MODEL format: ${opencodeModel}. Expected format: provider/model`);
      }

      const message = await client.session.chat({
        id: session.id,
        providerID,
        modelID,
        parts: [{ type: "text", text: agentPrompt ? `${agentPrompt}\n\n${prompt}` : prompt }],
      });

      const messageDetails = await client.session.message({
        id: session.id,
        messageID: message.id,
      });

      // Extract text from response parts
      aiOutput = messageDetails.parts
        .filter(part => part.type === "text")
        .map(part => part.content)
        .join("\n");

      logger.info(aiOutput);
      logger.success("opencode SDK completed");
    } catch (error) {
      throw new Error(`opencode SDK execution failed: ${error.message}`);
    }

    const gitStatus = gitStatusPorcelain();
    if (gitStatus) {
      logger.info("Changes detected, committing...");

      // Ensure correct branch before committing (harmless if already on it)
      ensureBranch(context.branch);
      const subject = `AI: ${prompt.substring(0, 60)}${prompt.length > 60 ? "..." : ""}`;
      const body = `Requested by @${context.author || "unknown"} in ${context.resourceType} #${context.resourceId}`;

      const username = process.env.GITLAB_USERNAME;
      configureUser(username);
      commitAll(subject, body);

      const token = process.env.GITLAB_TOKEN;
      const host = process.env.CI_SERVER_HOST || "gitlab.com";
      if (!username) throw new Error("To push with a Personal Access Token, set GITLAB_USERNAME");
      pushWithToken(host, context.projectPath, context.branch, username, token);

      let successMessage = `✅ AI has completed your request!\n\n`;
      successMessage += `🔀 Changes pushed to branch: \`${context.branch}\`\n\n`;
      if ((context.resourceType || "").toLowerCase() === "issue") {
        successMessage += `💡 Next steps:\n`;
        successMessage += `1. Review the changes on branch \`${context.branch}\`\n`;
        successMessage += `2. Create a merge request when ready\n`;
      }
      await postComment(context, successMessage);
    } else {
      logger.info("No changes needed");
      await postComment(
        context,
        "ℹ️ AI analyzed your request but determined no code changes were needed.\n\n" +
        `AI's response:\n${aiOutput.substring(0, 500)}${aiOutput.length > 500 ? "..." : ""}`,
      );
    }

    writeOutput(true, {
      prompt,
      branch: context.branch,
      hasChanges: !!gitStatus,
    });
  } catch (error) {
    logger.error(error.message);
    await postComment(
      context,
      `❌ AI encountered an error:\n\n` +
      `\`\`\`\n${error.message}\n\`\`\`\n\n` +
      `Please check the pipeline logs for details.`,
    );
    writeOutput(false, { error: error.message });
    process.exit(1);
  }
}
