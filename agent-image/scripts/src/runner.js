import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import logger from "./logger.js";
import { requireEnv, postComment } from "./gitlab.js";
import { ensureBranch, gitStatusPorcelain, configureUser, commitAll, pushWithToken } from "./git.js";
import { extractPrompt } from "./prompt.js";

export async function run() {
  logger.info("Claude GitLab Runner Started");

  // Context
  const context = {
    projectPath: process.env.CLAUDE_PROJECT_PATH,
    author: process.env.CLAUDE_AUTHOR,
    resourceType: process.env.CLAUDE_RESOURCE_TYPE,
    resourceId: process.env.CLAUDE_RESOURCE_ID,
    branch:
      process.env.CLAUDE_BRANCH ||
      process.env.CI_COMMIT_REF_NAME ||
      process.env.CI_COMMIT_BRANCH ||
      "main",
    note: process.env.CLAUDE_NOTE,
    triggerPhrase: process.env.TRIGGER_PHRASE,
  };

  logger.info(`Project: ${context.projectPath || "(unknown)"}`);
  logger.info(`Triggered by: @${context.author || "unknown"}`);
  logger.info(`Branch: ${context.branch}`);

  try {
    requireEnv();

    const prompt = extractPrompt(context.note, context.triggerPhrase);
    if (!prompt) throw new Error("No prompt found after trigger phrase");
    logger.info(`Prompt: ${prompt}`);

    await postComment(context, "🤖 Claude is analyzing your request...");

    const hasClaudeCode =
      process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!hasClaudeCode)
      throw new Error(
        "No Claude authentication configured. Please set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.",
      );

    const model = process.env.CLAUDE_MODEL || "sonnet";
    const claudeArgs = [
      "--yes",
      "@anthropic-ai/claude-code",
      "--model",
      model,
      "-p",
      prompt,
      "--permission-mode",
      "acceptEdits",
    ];
    if (process.env.CLAUDE_INSTRUCTIONS) {
      claudeArgs.push("--append-system-prompt", process.env.CLAUDE_INSTRUCTIONS);
    }

    logger.start("Running Claude Code...");
    let claudeOutput = "";
    try {
      claudeOutput = execFileSync("npx", claudeArgs, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
      });
      logger.success("Claude Code completed");
    } catch (error) {
      const stderr = error?.stderr?.toString?.() || "";
      const stdout = error?.stdout?.toString?.() || "";
      throw new Error(
        `Claude Code execution failed: ${error.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
      );
    }

    const gitStatus = gitStatusPorcelain();
    if (gitStatus) {
      logger.info("Changes detected, committing...");

      ensureBranch(context.branch);
      const subject = `Claude: ${prompt.substring(0, 60)}${prompt.length > 60 ? "..." : ""}`;
      const body = `Requested by @${context.author || "unknown"} in ${context.resourceType} #${context.resourceId}`;

      const host = process.env.CI_SERVER_HOST || "gitlab.com";
      configureUser(host);
      commitAll(subject, body);

      const username = process.env.GITLAB_USERNAME;
      const token = process.env.GITLAB_TOKEN;
      if (!username) throw new Error("To push with a Personal Access Token, set GITLAB_USERNAME");
      pushWithToken(host, context.projectPath, context.branch, username, token);

      let successMessage = `✅ Claude has completed your request!\n\n`;
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
        "ℹ️ Claude analyzed your request but determined no code changes were needed.\n\n" +
          `Claude's response:\n${claudeOutput.substring(0, 500)}${claudeOutput.length > 500 ? "..." : ""}`,
      );
    }

    const output = {
      success: true,
      prompt,
      branch: context.branch,
      hasChanges: !!gitStatus,
      timestamp: new Date().toISOString(),
    };
    writeFileSync("claude-output.json", JSON.stringify(output, null, 2));
  } catch (error) {
    logger.error(error.message);
    await postComment(
      context,
      `❌ Claude encountered an error:\n\n` +
        `\`\`\`\n${error.message}\n\`\`\`\n\n` +
        `Please check the pipeline logs for details.`,
    );
    const output = { success: false, error: error.message, timestamp: new Date().toISOString() };
    writeFileSync("claude-output.json", JSON.stringify(output, null, 2));
    process.exit(1);
  }
}
