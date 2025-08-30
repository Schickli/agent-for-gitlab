import logger from "./logger.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

export async function runOpencode(context, prompt) {
  logger.start("Running opencode via cli...");

  const configuration = startMCPServer(context);
  setOpenCodeMCPServerConfiguration(configuration);

  const [providerID, modelID] = context.opencodeModel.split('/');
  if (!providerID || !modelID) {
    throw new Error(`Invalid OPENCODE_MODEL format: ${context.opencodeModel}. Expected format: provider/model`);
  }

  logger.info(`Using model: ${modelID} from provider: ${providerID}`);

  logger.info("Sending prompt to model ... this may take a while");

  const { spawnSync } = await import("node:child_process");
  // Use the "opencode" CLI to send the prompt and get the response
  const cliArgs = [
    "run",
    "--print-logs",
    "--model", 
    context.opencodeModel,
    "--log-level",
    "ERROR"
  ];

  logger.info(`Running: opencode ${cliArgs.join(" ")}`);

  const result = spawnSync("opencode", cliArgs, {
    encoding: "utf-8",
    input: `${context.agentPrompt}\n${prompt}`,
    stdio: ["pipe", process.stdout, process.stderr] 
  });

  if (result.status !== 0) {
    logger.error("opencode CLI exited with error: ", result.stderr);
    throw new Error(`opencode CLI failed: ${result.stderr}`);
  }

  logger.success("opencode CLI completed");
}

function setOpenCodeMCPServerConfiguration(mcpServerConfig) {
  logger.info("Configuring OpenCode MCP server settings...");

  const configDir = join(homedir(), ".config", "opencode");
  const configPath = join(configDir, "opencode.json");

  try {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    let config = { "$schema": "https://opencode.ai/config.json", mcp: {} };

    config.mcp[mcpServerConfig.name] = {
      type: "local",
      command: mcpServerConfig.command,
      environment: mcpServerConfig.env,
      enabled: true
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.info(`OpenCode configuration updated at ${configPath}`);

  } catch (error) {
    logger.error(`Failed to configure OpenCode MCP server: ${error.message}`);
    // Don't throw here - let the process continue even if config fails
  }
}

function startMCPServer(context) {
  logger.info("Starting GitLab MCP server...");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const mcpServerPath = join(__dirname, "..", "mcp", "mcp.ts");

  // Set environment variables for the MCP server
  const env = {
    ...process.env,
    CI_SERVER_URL: context.serverUrl,
    GITLAB_TOKEN: context.gitlabToken,
    CI_PROJECT_ID: context.projectId,
  };

  try {
    // Start the MCP server process
    const mcpProcess = spawn("npx", ["tsx", mcpServerPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      cwd: join(__dirname, "..")
    });

    mcpProcess.on("error", (error) => {
      logger.error(`MCP server error: ${error.message}`);
    });

    mcpProcess.stderr.on("data", (data) => {
      logger.info(`MCP server: ${data.toString().trim()}`);
    });

    logger.info("GitLab MCP server started");

    // Return configuration for opencode
    return {
      name: "gitlab-mcp-server",
      command: ["npx", "tsx", mcpServerPath],
      env: {
        CI_SERVER_URL: context.serverUrl,
        GITLAB_TOKEN: context.gitlabToken,
        CI_PROJECT_ID: context.projectId,
        AI_RESOURCE_ID: context.resourceId,
        AI_RESOURCE_TYPE: context.resourceType,
      }
    };
  } catch (error) {
    logger.error(`Failed to start MCP server: ${error.message}`);
    throw error;
  }
}