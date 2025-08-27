import logger from "./logger.js";
import { buildContext } from "./context.js";
import { postComment } from "./gitlab.js";
import { isInsideGitRepo, setupLocalRepository, ensureBranch } from "./git.js";
import { extractPrompt } from "./prompt.js";
import { validateProviderKeys, validateConfig } from "./config.js";
import { runOpencode } from "./opencode.js";
import { writeOutput } from "./output.js";
import { gitSetup } from "./git.js";

export async function run() {
  logger.info("AI GitLab Runner Started");

  const context = buildContext();

  logger.info(`Project: ${context.projectPath || "(unknown)"}`);
  logger.info(`Triggered by: @${context.author || "unknown"}`);
  logger.info(`Branch: ${context.branch}`);

  try {
    validateConfig(context);

    gitSetup(context);

    if (!isInsideGitRepo()) {
      setupLocalRepository(context);
    } else {
      // Ensure we're on the correct branch even if we're already in a git repo
      ensureBranch(context);
    }

    const prompt = extractPrompt(context.note, context.triggerPhrase);
    if (!prompt) throw new Error("No prompt found after trigger phrase");
    logger.info(`Prompt: ${prompt}`);

    await postComment(context, "🤖 Getting the vibes started...");

    const hasAnyProviderKey = validateProviderKeys();
    if (!hasAnyProviderKey) {
      logger.warn(
        "No provider API key detected in env. opencode may fail to start unless credentials are pre-configured via 'opencode auth login'.",
      );
    }

    logger.info(`Working directory: ${process.cwd()}`); // Should be /opt/agent/repo

    const aiOutput = await runOpencode(context, prompt);

    logger.info(`Working directory after opencode: ${process.cwd()}`);

    writeOutput(true, {
      prompt,
      branch: context.branch,
      aiOutput,
    });
    
    process.exit(0);
  } catch (error) {
    await handleError(context, error);
  }
}

async function handleError(context, error) {
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
