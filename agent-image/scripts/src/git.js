import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import logger from "./logger.js";

export function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

export function ensureBranch(branch) {
  const cur = currentBranch();
  if (cur !== branch) {
    logger.info(`Checking out branch '${branch}' (was '${cur}')`);
    execFileSync("git", ["checkout", "-B", branch], { encoding: "utf8" });
  }
}

export function gitStatusPorcelain() {
  return execFileSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).trim();
}

export function configureUser(username) {
  execFileSync("git", ["config", "user.name", username], {
    encoding: "utf8",
  });
  execFileSync("git", ["config", "user.email", `${username}@buhlergroup.com`], {
    encoding: "utf8",
  });
}

export function commitAll(subject, body) {
  execFileSync("git", ["add", "-A"], { encoding: "utf8" });
  execFileSync("git", ["commit", "-m", subject, "-m", body], {
    encoding: "utf8",
  });
}

export function pushWithToken(host, projectPath, branch, username, token) {
  const remoteUrl = `https://${encodeURIComponent(username)}:${encodeURIComponent(token)}@${host}/${projectPath}.git`;
  logger.start(`Pushing changes to ${host}/${projectPath}...`);
  execFileSync("git", ["push", remoteUrl, branch], { encoding: "utf8" });
}

export function isInsideGitRepo() {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { 
      encoding: "utf8", 
      stdio: ["ignore", "pipe", "ignore"] 
    }).trim();
    return out === "true";
  } catch {
    return false;
  }
}

export function cloneRepository(cloneUrl, targetDir) {
  logger.start(`Cloning repository into ${targetDir}...`);
  execFileSync("git", ["clone", cloneUrl, targetDir], { 
    encoding: "utf8", 
    stdio: ["ignore", "pipe", "pipe"] 
  });
  logger.success("Clone completed");
}

export function setupLocalRepository(host, projectPath, branch, targetDir) {
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

    cloneRepository(cloneUrl, targetDir);
    process.chdir(targetDir);
  }

  // Ensure we're on the desired working branch
  ensureBranch(branch);
}
