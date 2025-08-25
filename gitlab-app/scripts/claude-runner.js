#!/usr/bin/env node

/**
 * Claude Code Runner for GitLab Pipelines
 * This script is executed within GitLab CI when triggered by @claude mentions
 */

import { execSync } from "child_process";
import fs from "fs";
import https from "https";

// GitLab API configuration
const GITLAB_URL = process.env.CI_SERVER_URL || "https://gitlab.com";
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const PROJECT_ID = process.env.CI_PROJECT_ID;

// Claude context from webhook
const context = {
  projectId: PROJECT_ID,
  resourceType: process.env.CLAUDE_RESOURCE_TYPE,
  resourceId: process.env.CLAUDE_RESOURCE_ID,
  branch: process.env.CLAUDE_BRANCH,
  author: process.env.CLAUDE_AUTHOR,
  note: process.env.CLAUDE_NOTE,
  projectPath: process.env.CLAUDE_PROJECT_PATH,
};

/**
 * Make GitLab API request
 */
function gitlabApi(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${GITLAB_URL}/api/v4${path}`);
    const options = {
      method,
      headers: {
        "PRIVATE-TOKEN": GITLAB_TOKEN,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        } else {
          reject(new Error(`GitLab API error ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Post a comment to issue or merge request
 */
async function postComment(message) {
  const endpoint =
    context.resourceType === "issue"
      ? `/projects/${PROJECT_ID}/issues/${context.resourceId}/notes`
      : `/projects/${PROJECT_ID}/merge_requests/${context.resourceId}/notes`;

  try {
    await gitlabApi("POST", endpoint, { body: message });
    console.log(
      `✅ Posted comment to ${context.resourceType} #${context.resourceId}`,
    );
  } catch (error) {
    console.error("❌ Failed to post comment:", error.message);
  }
}

/**
 * Extract Claude prompt from the note
 */
function extractPrompt(note) {
  const match = note.match(/@claude\s+([\s\S]*)/i);
  return match ? match[1].trim() : "";
}

/**
 * Main execution
 */
async function main() {
  console.log("🤖 Claude GitLab Runner Started");
  console.log(`📦 Project: ${context.projectPath}`);
  console.log(`🔀 Branch: ${context.branch}`);
  console.log(`👤 Triggered by: @${context.author}`);

  try {
    // Extract prompt
    const prompt = extractPrompt(context.note);
    if (!prompt) {
      throw new Error("No prompt found after @claude mention");
    }

    console.log(`📝 Prompt: ${prompt}`);

    // Post initial status
    await postComment("🤖 Claude is analyzing your request...");

    // Check if Claude Code is available
    const hasClaudeCode =
      process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN;

    if (!hasClaudeCode) {
      throw new Error(
        "No Claude authentication configured. Please set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.",
      );
    }

    // Build Claude command
    const claudeArgs = [
      "npx",
      "@anthropic-ai/claude-code",
      "--model",
      process.env.CLAUDE_MODEL || "sonnet",
      "-p",
      prompt,
      "--permission-mode acceptEdits"
    ];

    // Add custom instructions if provided
    if (process.env.CLAUDE_INSTRUCTIONS) {
      claudeArgs.push("--append-system-prompt", `"${process.env.CLAUDE_INSTRUCTIONS}"`);
    }

    // Execute Claude Code
    console.log("🚀 Running Claude Code...");
    let claudeOutput;
    try {
      claudeOutput = execSync(claudeArgs, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
      });
      console.log("✅ Claude Code completed");
    } catch (error) {
      console.error("❌ Claude Code failed:", error.message);
      throw new Error(`Claude Code execution failed: ${error.message}`);
    }

    // Check for changes
    const gitStatus = execSync("git status --porcelain", {
      encoding: "utf8",
    }).trim();

    if (gitStatus) {
      console.log("📝 Changes detected, committing...");

      // Stage and commit changes
      execSync("git add -A");
      const commitMessage = `Claude: ${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}

      Requested by @${context.author} in ${context.resourceType} #${context.resourceId}`;

      execSync(`git config user.name "Claude Bot"`);
      execSync(
        `git config user.email "claude-bot@${process.env.CI_SERVER_HOST}"`,
      );
      execSync(`git commit -m "${commitMessage}"`);

      // Push changes
      console.log("🚀 Pushing changes...");
      execSync(`git push origin ${context.branch}`);

      // Post success message
      let successMessage = `✅ Claude has completed your request!\n\n`;
      successMessage += `🔀 Changes pushed to branch: \`${context.branch}\`\n\n`;

      // For issues, suggest creating a merge request
      if (context.resourceType === "issue") {
        successMessage += `💡 Next steps:\n`;
        successMessage += `1. Review the changes on branch \`${context.branch}\`\n`;
        successMessage += `2. Create a merge request when ready\n`;
      }

      await postComment(successMessage);
    } else {
      console.log("ℹ️ No changes needed");
      await postComment(
        `ℹ️ Claude analyzed your request but determined no code changes were needed.\n\n` +
        `Claude's response:\n${claudeOutput.substring(0, 500)}${claudeOutput.length > 500 ? "..." : ""}`,
      );
    }

    // Save output for CI artifacts
    const output = {
      success: true,
      prompt,
      branch: context.branch,
      hasChanges: !!gitStatus,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync("claude-output.json", JSON.stringify(output, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);

    // Post error message
    await postComment(
      `❌ Claude encountered an error:\n\n` +
      `\`\`\`\n${error.message}\n\`\`\`\n\n` +
      `Please check the [pipeline logs](${process.env.CI_PIPELINE_URL}) for details.`,
    );

    // Save error output
    const output = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync("claude-output.json", JSON.stringify(output, null, 2));

    process.exit(1);
  }
}

// Execute
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
