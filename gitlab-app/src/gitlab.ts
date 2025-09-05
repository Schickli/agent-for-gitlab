import { Gitlab } from "@gitbeaker/rest";
import { logger } from "./logger";

// Initialize GitLab client
const gitlab = new Gitlab({
  host: process.env.GITLAB_URL || "https://gitlab.com",
  token: process.env.GITLAB_TOKEN!,
});

export async function triggerPipeline(
  projectId: number,
  ref: string,
  variables?: Record<string, string>,
  mrIid?: number
): Promise<number> {
  try {
    logger.debug("Creating pipeline", {
      projectId,
      ref,
      variables: logger.maskSensitive(variables),
      mrIid,
    });

    const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";
    const token = process.env.GITLAB_TOKEN!;

    // Transform variables to GitLab API format
    let pipelineVariables: Array<{ key: string; value: string }> = variables
      ? Object.entries(variables).map(([key, value]) => ({ key, value }))
      : [];

    const requestBody = {
      ref,
      variables: pipelineVariables,
    };

    // Important: Use the general pipeline endpoint so variables (like AI_TRIGGER) are honored
    const baseUrl = `${gitlabUrl}/api/v4/projects/${projectId}/pipeline`;

    logger.debug("Pipeline request body", {
      url: baseUrl,
      body: {
        ...requestBody,
        variables: logger.maskSensitive(pipelineVariables),
      },
    });

    // Ensure only the AI job is selected by rules in the pipeline (ai_webhook_handler)
    // The .gitlab-ci.yml uses `rules: if: '$AI_TRIGGER == "true"'` on the ai job.
    // We set AI_TRIGGER=true here so that job is included and others can be skipped by rules.
    const hasAiTrigger = pipelineVariables.some((v) => v.key === "AI_TRIGGER");
    if (!hasAiTrigger) {
      pipelineVariables.push({ key: "AI_TRIGGER", value: "true" });
    } else {
      // normalize to "true" if provided differently
      pipelineVariables = pipelineVariables.map((v) =>
        v.key === "AI_TRIGGER" ? { ...v, value: "true" } : v
      );
    }

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...requestBody,
        variables: pipelineVariables,
      }),
    });

    const responseText = await response.text();
    let responseData;

    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      logger.error("Failed to parse pipeline response", {
        status: response.status,
        statusText: response.statusText,
        responseText,
      });
      throw new Error(
        `Pipeline API returned invalid JSON: ${response.statusText}`
      );
    }

    if (!response.ok) {
      logger.error("Pipeline creation failed", {
        status: response.status,
        statusText: response.statusText,
        responseBody: responseData,
        projectId,
        ref,
        mrIid,
      });
      throw new Error(
        responseData.message ||
          responseData.error ||
          `Pipeline creation failed: ${response.statusText}`
      );
    }

    logger.info("Pipeline created successfully", {
      pipelineId: responseData.id,
      webUrl: responseData.web_url,
      status: responseData.status,
    });

    return responseData.id;
  } catch (error) {
    logger.error("Failed to create pipeline", {
      error: error instanceof Error ? error.message : error,
      projectId,
      ref,
      mrIid,
    });
    throw error;
  }
}

export async function cancelOldPipelines(
  projectId: number,
  keepPipelineId: number,
  ref: string
): Promise<void> {
  try {
    logger.debug("Fetching pipelines for cancellation", { projectId, ref });

    // List pipelines for the ref
    const pipelines: Array<{ id: number }> = await gitlab.Pipelines.all(
      projectId,
      {
        ref,
        status: "pending",
      }
    );

    // Cancel old pipelines
    const cancelPromises = pipelines
      .filter((p: { id: number }) => p.id !== keepPipelineId)
      .map((p: { id: number }) =>
        gitlab.Pipelines.cancel(projectId, p.id).catch((err: unknown) => {
          logger.warn(`Failed to cancel pipeline ${p.id}:`, {
            error: err instanceof Error ? err.message : err,
          });
        })
      );

    await Promise.all(cancelPromises);
    logger.info("Old pipelines cancelled", { count: cancelPromises.length });
  } catch (error) {
    logger.error("Error cancelling old pipelines:", {
      error: error instanceof Error ? error.message : error,
    });
    // Don't throw - this is not critical
  }
}

// Post a simple startup comment on an MR or Issue
export async function postStartComment(
  projectId: number,
  options: {
    mrIid?: number;
    issueIid?: number;
    message?: string;
    discussionId?: string; // if provided, reply in same discussion
  }
): Promise<void> {
  const { mrIid, issueIid } = options;
  const message = options.message ?? "Getting the vibes started";
  const discussionId = options.discussionId;

  if (!mrIid && !issueIid) {
    logger.warn("postStartComment called without mrIid or issueIid", {
      projectId,
    });
    return;
  }

  try {
    const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";
    const token = process.env.GITLAB_TOKEN!;

    // When discussionId is present (MR only), post as a reply in that discussion thread.
    // For issues, GitLab does not have discussions like MRs; we always post a note on the issue.
    const path =
      discussionId && mrIid
        ? `/api/v4/projects/${projectId}/merge_requests/${mrIid}/discussions/${discussionId}/notes`
        : mrIid
        ? `/api/v4/projects/${projectId}/merge_requests/${mrIid}/notes`
        : `/api/v4/projects/${projectId}/issues/${issueIid}/notes`;

    logger.debug("Posting start comment", {
      projectId,
      mrIid,
      issueIid,
      message,
      url: `${gitlabUrl}${path}`,
    });

    const res = await fetch(`${gitlabUrl}${path}`, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: message }),
    });

    if (!res.ok) {
      const text = await res.text();
      let errMsg = `Failed to post start comment: ${res.status} ${res.statusText}`;
      try {
        const data = JSON.parse(text);
        errMsg = data.message || data.error || errMsg;
      } catch {
        // ignore JSON parse error; use raw text if informative
        if (text) errMsg = `${errMsg} - ${text}`;
      }
      logger.warn("Start comment API error", {
        projectId,
        mrIid,
        issueIid,
        status: res.status,
        statusText: res.statusText,
        errMsg,
      });
      return; // Do not throw; comment is non-critical
    }

    logger.info("Start comment posted", { projectId, mrIid, issueIid });
  } catch (error) {
    logger.warn("Failed to post start comment", {
      error: error instanceof Error ? error.message : error,
      projectId,
      mrIid,
      issueIid,
    });
    // Non-critical, don't throw
  }
}

// Get project details including default branch
export async function getProject(projectId: number): Promise<{
  id: number;
  default_branch: string;
  path_with_namespace: string;
}> {
  try {
    logger.debug("Fetching project details", { projectId });
    const project = await gitlab.Projects.show(projectId);

    return {
      id: project.id,
      default_branch: project.default_branch || "main",
      path_with_namespace: project.path_with_namespace,
    };
  } catch (error) {
    logger.error("Failed to fetch project", {
      error: error instanceof Error ? error.message : error,
      projectId,
    });
    throw error;
  }
}

// Check if a branch exists
export async function branchExists(
  projectId: number,
  branchName: string
): Promise<boolean> {
  try {
    logger.debug("Checking branch existence", { projectId, branchName });
    await gitlab.Branches.show(projectId, branchName);
    return true;
  } catch (error: any) {
    // 404 means branch doesn't exist
    if (error.response?.statusCode === 404) {
      return false;
    }
    logger.error("Error checking branch", {
      error: error instanceof Error ? error.message : error,
      projectId,
      branchName,
    });
    throw error;
  }
}

// Create a new branch
export async function createBranch(
  projectId: number,
  branchName: string,
  ref: string
): Promise<void> {
  try {
    logger.info("Creating new branch", { projectId, branchName, ref });

    // Use raw API for better error handling
    const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";
    const token = process.env.GITLAB_TOKEN!;

    const response = await fetch(
      `${gitlabUrl}/api/v4/projects/${projectId}/repository/branches`,
      {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          branch: branchName,
          ref: ref,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Branch creation failed: ${response.statusText}`;

      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        // Use raw error text if not JSON
        errorMessage = errorText || errorMessage;
      }

      logger.error("Branch creation API error", {
        status: response.status,
        errorMessage,
        projectId,
        branchName,
        ref,
      });

      throw new Error(errorMessage);
    }

    logger.info("Branch created successfully", { projectId, branchName });
  } catch (error) {
    logger.error("Failed to create branch", {
      error: error instanceof Error ? error.message : error,
      projectId,
      branchName,
      ref,
    });
    throw error;
  }
}

// Sanitize branch name for GitLab
export function sanitizeBranchName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric chars with dashes
    .replace(/-+/g, "-") // Replace multiple dashes with single dash
    .replace(/^-|-$/g, "") // Remove leading/trailing dashes
    .substring(0, 50); // Limit length
}

// Fetch full discussion thread notes (excluding system notes unless includeSystem=true)
export async function getDiscussionThread(params: {
  projectId: number;
  mrIid?: number;
  issueIid?: number;
  discussionId: string;
  includeSystem?: boolean;
}): Promise<
  Array<{
    id: string | number;
    author: { username?: string; name?: string };
    body: string;
    created_at?: string;
    system?: boolean;
  }>
> {
  const { projectId, mrIid, issueIid, discussionId, includeSystem } = params;

  if (!mrIid && !issueIid) {
    logger.warn("getDiscussionThread called without mrIid or issueIid", {
      projectId,
      discussionId,
    });
    return [];
  }

  try {
    const gitlabUrl = process.env.GITLAB_URL || "https://gitlab.com";
    const token = process.env.GITLAB_TOKEN!;

    // Issues in GitLab have discussions endpoint, merge requests use a similar path
    const basePath = mrIid
      ? `/api/v4/projects/${projectId}/merge_requests/${mrIid}/discussions/${discussionId}`
      : `/api/v4/projects/${projectId}/issues/${issueIid}/discussions/${discussionId}`;

    const url = `${gitlabUrl}${basePath}`;
    logger.debug("Fetching discussion thread", { url });

    const res = await fetch(url, {
      headers: { "PRIVATE-TOKEN": token },
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn("Failed to fetch discussion thread", {
        status: res.status,
        statusText: res.statusText,
        text,
        projectId,
        mrIid,
        issueIid,
        discussionId,
      });
      return [];
    }

  const data: any = await res.json();
  const notes: any[] = (data && Array.isArray(data.notes)) ? data.notes : [];

    return notes
      .filter((n) => includeSystem || !n.system)
      .map((n) => ({
        id: n.id,
        author: {
          username: n.author?.username,
          name: n.author?.name,
        },
        body: n.body || "",
        created_at: n.created_at,
        system: n.system,
      }));
  } catch (error) {
    logger.warn("Error fetching discussion thread", {
      error: error instanceof Error ? error.message : error,
      projectId,
      mrIid,
      issueIid,
      discussionId,
    });
    return [];
  }
}
