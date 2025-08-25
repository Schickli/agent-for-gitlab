import { request as httpsRequest } from "node:https";
import logger from "./logger.js";

const GITLAB_URL = process.env.CI_SERVER_URL || "https://gitlab.com";
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;
const PROJECT_ID = process.env.CI_PROJECT_ID;

export function requireEnv() {
  if (!GITLAB_TOKEN) throw new Error("Missing GITLAB_TOKEN environment variable");
  if (!PROJECT_ID) throw new Error("Missing CI_PROJECT_ID environment variable");
}

export function gitlabApi(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${GITLAB_URL}/api/v4${path}`);
    const options = {
      method,
      headers: {
        "PRIVATE-TOKEN": GITLAB_TOKEN,
        "Content-Type": "application/json",
      },
    };

    const req = httpsRequest(url, options, (res) => {
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
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

export async function postComment({ resourceType, resourceId }, message) {
  const endpoint =
    (resourceType || "").toLowerCase() === "issue"
      ? `/projects/${PROJECT_ID}/issues/${resourceId}/notes`
      : `/projects/${PROJECT_ID}/merge_requests/${resourceId}/notes`;

  try {
    await gitlabApi("POST", endpoint, { body: message });
    logger.success(`Posted comment to ${resourceType} #${resourceId}`);
  } catch (error) {
    logger.error(`Failed to post comment: ${error.message}`);
  }
}
