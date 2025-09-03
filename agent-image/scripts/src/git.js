import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import logger from "./logger.js";

export function gitSetup(context) {
  // Set credential helper to store credentials
  execFileSync("git", ["config", "--global", "credential.helper", "store"], {
    encoding: "utf8",
  });

  // Set author info if provided in context
  if (context.username && context.email) {
    logger.info(`Configuring git user as ${context.username} <${context.email}>`);
    execFileSync("git", ["config", "--global", "user.name", context.username], {
      encoding: "utf8",
    });
    execFileSync("git", ["config", "--global", "user.email", context.email], {
      encoding: "utf8",
    });
  }

  // Prepare credential approval input
  const credentialInput = [
    "protocol=https",
    `host=${context.host}`,
    `username=${context.username}`,
    `password=${context.gitlabToken}`,
    "",
  ].join("\n");

  logger.info(`Configured git for host ${context.host} as user ${context.username}`);

  // Approve credentials for git
  execFileSync("git", ["credential", "approve"], {
    input: credentialInput,
    encoding: "utf8",
  });

  // Set additional git settings
  execFileSync("git", ["config", "--global", "push.autoSetupRemote", "true"], {
    encoding: "utf8",
  });
  execFileSync("git", ["config", "--global", "pull.rebase", "true"], {
    encoding: "utf8",
  });
}

export function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

export function ensureBranch(context) {
  const cur = currentBranch();
  if (cur !== context.branch) {
    logger.info(`Checking out branch '${context.branch}' (was '${cur}')`);
    execFileSync("git", ["checkout", "-B", context.branch], { encoding: "utf8" });
  }

  pullWithToken(context);
}

export function pullWithToken(context) {
  const remoteUrl = `https://${context.host}/${context.projectPath}.git`;
  logger.start(`Pulling latest changes from ${context.host}/${context.projectPath}...`);
  try {
    // Use rebase strategy to handle divergent branches
    execFileSync("git", ["pull", "--rebase", remoteUrl, context.branch], { encoding: "utf8" });
    setRemote(context);
  } catch (error) {
    logger.warn("Pull with rebase failed, trying fetch and reset...");
    try {
      // Fetch the remote branch
      execFileSync("git", ["fetch", remoteUrl, context.branch], { encoding: "utf8" });
      // Reset to the remote branch (this will lose local commits, but that's ok for an agent)
      execFileSync("git", ["reset", "--hard", "FETCH_HEAD"], { encoding: "utf8" });
      setRemote(context);
      logger.info("Successfully synced with remote branch");
    } catch (fallbackError) {
      logger.warn("All pull strategies failed, branch might not exist remotely yet");
    }
  }
}

function setRemote(context) {
  // Set default remote and branch for push
  const remoteUrl = `https://${context.host}/${context.projectPath}.git`;
  try {
    execFileSync("git", ["remote", "remove", "origin"], { encoding: "utf8" });
  } catch { }
  execFileSync("git", ["remote", "add", "origin", remoteUrl], { encoding: "utf8" });
  execFileSync("git", ["branch", "--set-upstream-to", `origin/${context.branch}`, context.branch], {
    encoding: "utf8",
  });
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

export function setupLocalRepository(context) {
  const targetDir = path.resolve(context.checkoutDir);

  if (existsSync(path.join(targetDir, ".git"))) {
    process.chdir(targetDir);
    logger.info(`Using existing checkout at ${targetDir}`);
  } else {
    const baseUrl = `https://${context.host}/${context.projectPath}.git`;
    cloneRepository(baseUrl, targetDir);
    process.chdir(targetDir);
  }

  ensureBranch(context);
}
