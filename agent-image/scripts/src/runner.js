import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import logger from "./logger.js";
import { requireEnv, postComment } from "./gitlab.js";
import { ensureBranch, gitStatusPorcelain, configureUser, commitAll, pushWithToken } from "./git.js";
import { extractPrompt } from "./prompt.js";

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

    const isInsideGitRepo = () => {
      try {
        const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        return out === "true";
      } catch {
        return false;
      }
    };

    if (!isInsideGitRepo()) {
      const targetDir = path.resolve(process.env.AI_CHECKOUT_DIR || "./repo");
      if (existsSync(path.join(targetDir, ".git"))) {
        process.chdir(targetDir);
        logger.info(`Using existing checkout at ${targetDir}`);
      } else {
        const baseUrl = process.env.CI_REPOSITORY_URL || `https://${host}/${projectPath}.git`;
        let cloneUrl = baseUrl;
        try {
          const u = new URL(baseUrl);
          const username = process.env.GITLAB_USERNAME || (process.env.CI_JOB_TOKEN ? "gitlab-ci-token" : "");
          const password = process.env.GITLAB_TOKEN || process.env.CI_JOB_TOKEN || "";
          if (username && password) {
            u.username = encodeURIComponent(username);
            u.password = encodeURIComponent(password);
          }
          cloneUrl = u.toString();
        } catch {
          // Fallback: keep baseUrl as-is
        }

        logger.start(`Cloning ${host}/${projectPath} into ${targetDir}...`);
        execFileSync("git", ["clone", cloneUrl, targetDir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
        process.chdir(targetDir);
        logger.success("Clone completed");
      }

      // Ensure we're on the desired working branch
      ensureBranch(context.branch);
    }

    const prompt = extractPrompt(context.note, context.triggerPhrase);
    if (!prompt) throw new Error("No prompt found after trigger phrase");
    logger.info(`Prompt: ${prompt}`);

    await postComment(context, "🤖 Getting the vibes started...");

    // Prepare opencode configuration
    const providerEnvVars = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GROQ_API_KEY",
      "DEEPSEEK_API_KEY",
      "TOGETHER_API_KEY",
      "FIREWORKS_API_KEY",
      "OPENROUTER_API_KEY",
      "AZURE_API_KEY",
      "CEREBRAS_API_KEY",
      "Z_API_KEY",
      // Bedrock options
      "AWS_ACCESS_KEY_ID",
      "AWS_PROFILE",
      "AWS_BEARER_TOKEN_BEDROCK",
    ];
    const hasAnyProviderKey = providerEnvVars.some((k) => !!process.env[k]);
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

    const cfg = {
      $schema: "https://opencode.ai/config.json",
      autoupdate: false,
      ...(opencodeModel ? { model: opencodeModel } : {}),
      permission: {
        edit: "allow",
        bash: "allow",
      },
      ...(agentPrompt
        ? {
          agent: {
            "gitlab-runner": {
              description: "Agent for GitLab automated code changes",
              prompt: agentPrompt,
              tools: {
                write: true,
                edit: true,
              },
            },
          },
        }
        : {}),
    };

    // Azure OpenAI specific check: resource name is required by opencode when using the Azure provider
    if (opencodeModel?.startsWith("azure/") && !process.env.AZURE_RESOURCE_NAME) {
      throw new Error(
        "OPENCODE_MODEL targets Azure, but AZURE_RESOURCE_NAME is not set. Define AZURE_RESOURCE_NAME (e.g., 'my-azure-openai').",
      );
    }

    const cfgPath = path.resolve("./.opencode.ci.json");
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

    logger.start("Running opencode...");
    let aiOutput = "";
    try {
      const args = [
        "run",
        // Non-interactive single-turn message
        prompt,
        "--print-logs",
      ];
      if (opencodeModel) {
        args.push("--model", opencodeModel);
      }
      if (agentPrompt) {
        args.push("--agent", "gitlab-runner");
      }

      aiOutput = execFileSync("opencode", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, OPENCODE_CONFIG: cfgPath },
      });

      logger.success("opencode completed");
    } catch (error) {
      const stderr = error?.stderr?.toString?.() || "";
      const stdout = error?.stdout?.toString?.() || "";
      throw new Error(
        `opencode execution failed: ${error.message}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
      );
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

    const output = {
      success: true,
      prompt,
      branch: context.branch,
      hasChanges: !!gitStatus,
      timestamp: new Date().toISOString(),
    };
    writeFileSync("ai-output.json", JSON.stringify(output, null, 2));
  } catch (error) {
    logger.error(error.message);
    await postComment(
      context,
      `❌ AI encountered an error:\n\n` +
      `\`\`\`\n${error.message}\n\`\`\`\n\n` +
      `Please check the pipeline logs for details.`,
    );
    const output = { success: false, error: error.message, timestamp: new Date().toISOString() };
    writeFileSync("ai-output.json", JSON.stringify(output, null, 2));
    process.exit(1);
  }
}
