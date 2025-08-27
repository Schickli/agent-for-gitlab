import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import logger from "./logger.js";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";

export async function runOpencode(context, prompt) {
  logger.start("Running opencode via SDK...");

  const server = await createOpencodeServer({
    hostname: "0.0.0.0",
    port: 3001,
  });

  logger.info(`Server running at ${server.url}`);

  try {
    const configuration = startMCPServer(context);
    setOpenCodeMCPServerConfiguration(configuration);

    const client = createOpencodeClient({
      baseUrl: "http://0.0.0.0:3001",
    });

    await client.app.init();

    const session = await client.session.create({ title: "GitLab Runner Session" });

    if (session.error) {
      logger.error("Session creation error: ", session.error.error);
      throw new Error(`Session creation error: ${session.error.error}`);
    }

    logger.info("Session created: ", session.data.id);

    const [providerID, modelID] = context.opencodeModel.split('/');
    if (!providerID || !modelID) {
      throw new Error(`Invalid OPENCODE_MODEL format: ${context.opencodeModel}. Expected format: provider/model`);
    }

    logger.info(`Using model: ${modelID} from provider: ${providerID}`);

    logger.info("Sending prompt to model ... this may take a while");
    const message = await client.session.chat({
      path: {
        id: session.data.id,
      },
      body: {
        modelID,
        providerID,
        system: context.agentPrompt || undefined,
        parts: [{ type: "text", text: prompt }],
        tools: {
          "*": true,
        }
      },
    });

    if (message.error) {
      logger.error("AI response error: ", message.error.error);
      throw new Error(`AI response error: ${message.error.error}`);
    }

    const aiOutput = message.data.parts
      .filter(part => part.type === "text")
      .map(part => part.text)
      .join("\n");

    logger.info(aiOutput);
    logger.success("opencode SDK completed");

    return aiOutput;
  } finally {
    server.close();
  }
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