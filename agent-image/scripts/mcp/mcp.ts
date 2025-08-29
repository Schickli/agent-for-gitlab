#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { request as httpsRequest } from "node:https";
import { z } from "zod";

// Configuration interface
interface GitLabConfig {
  serverUrl: string;
  gitlabToken: string;
  projectId: string;
  resourceId: string;
  resourceType: "issue" | "merge_request";
}

// GitLab API helper function
function gitlabApi(
  config: GitLabConfig,
  method: string,
  path: string,
  data: any = null
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${config.serverUrl}/api/v4${path}`);
    const options = {
      method,
      headers: {
        "PRIVATE-TOKEN": config.gitlabToken,
        "Content-Type": "application/json",
      },
    };

    const req = httpsRequest(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (
          typeof res.statusCode === "number" &&
          res.statusCode >= 200 &&
          res.statusCode < 300
        ) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        } else {
          reject(
            new Error(
              `GitLab API error ${res.statusCode ?? "unknown"}: ${body}`
            )
          );
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Schema definitions
const CreateCommentSchema = z.object({
  message: z.string().min(1).max(10000).describe("Comment message"),
});

export class GitLabMCPServer {
  private server: Server;
  private config: GitLabConfig;

  constructor(config: GitLabConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: "gitlab-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {
            create_gitlab_comment: true,
            get_current_gitlab_resource: true,
          },
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "create_gitlab_comment",
            description:
              "Create a comment on a GitLab for the current issue or merge request",
            inputSchema: {
              type: "object",
              properties: {
                message: {
                  type: "string",
                  description: "Comment message",
                },
              },
              required: ["message"],
              additionalProperties: false,
            },
          },
          {
            name: "get_current_gitlab_resource",
            description:
              "Get details of the current GitLab issue or merge request",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (name === "create_gitlab_comment") {
          const parsed = CreateCommentSchema.parse(args);
          return await this.createComment(parsed);
        } else if (name === "get_current_gitlab_resource") {
          return await this.getCurrentGitLabResource();
        } else {
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.message}`
          );
        }
        throw error;
      }
    });
  }

  private async createComment(args: z.infer<typeof CreateCommentSchema>) {
    try {
      const endpoint =
        this.config.resourceType === "issue"
          ? `/projects/${this.config.projectId}/issues/${this.config.resourceId}/notes`
          : `/projects/${this.config.projectId}/merge_requests/${this.config.resourceId}/notes`;

      const response = await gitlabApi(this.config, "POST", endpoint, {
        body: args.message,
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully created comment on ${this.config.resourceType} #${this.config.resourceId}. Comment ID: ${response.id}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create comment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async getCurrentGitLabResource() {
    try {
      const endpoint =
        this.config.resourceType === "issue"
          ? `/projects/${this.config.projectId}/issues/${this.config.resourceId}`
          : `/projects/${this.config.projectId}/merge_requests/${this.config.resourceId}`;

      const response = await gitlabApi(this.config, "GET", endpoint);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: response.id,
                title: response.title,
                description: response.description,
                state: response.state,
                author: response.author,
                created_at: response.created_at,
                updated_at: response.updated_at,
                web_url: response.web_url,
                ...(this.config.resourceType === "merge_request" && {
                  source_branch: response.source_branch,
                  target_branch: response.target_branch,
                  merge_status: response.merge_status,
                }),
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get resource: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("GitLab MCP server running on stdio");
  }
}

// Main execution
async function main() {
  const config: GitLabConfig = {
    serverUrl: process.env.CI_SERVER_URL || "https://gitlab.com",
    gitlabToken: process.env.GITLAB_TOKEN || "",
    projectId: process.env.CI_PROJECT_ID || "",
    resourceId: process.env.AI_RESOURCE_ID || process.env.CI_ISSUE_IID || "",
    resourceType: (process.env.AI_RESOURCE_TYPE === "merge_request"
      ? "merge_request"
      : "issue") as "merge_request" | "issue",
  };

  if (!config.gitlabToken || !config.projectId) {
    console.error(
      "Error: GITLAB_TOKEN and CI_PROJECT_ID environment variables are required"
    );
    process.exit(1);
  }

  const server = new GitLabMCPServer(config);
  await server.run();
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
