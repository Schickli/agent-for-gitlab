import { request as httpsRequest } from "node:https";
import logger from "./logger.js";


export function gitlabApi(context, method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${context.serverUrl}/api/v4${path}`);
    const options = {
      method,
      headers: {
        "PRIVATE-TOKEN": context.gitlabToken,
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

export async function postComment(context, message) {
  const endpoint =
    (context.resourceType || "").toLowerCase() === "issue"
      ? `/projects/${context.projectId}/issues/${context.resourceId}/notes`
      : `/projects/${context.projectId}/merge_requests/${context.resourceId}/notes`;

  try {
    await gitlabApi(context, "POST", endpoint, { body: message });
    logger.info(`Posted comment to ${context.resourceType} #${context.resourceId}`);
  } catch (error) {
    logger.error(`Failed to post comment: ${error.message}`);
  }
}
