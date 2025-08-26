import { execFileSync } from "node:child_process";
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
