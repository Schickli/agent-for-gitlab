import { writeFileSync } from "node:fs";

export function writeOutput(success, data = {}) {
  const output = {
    success,
    timestamp: new Date().toISOString(),
    ...data,
  };

  writeFileSync("/opt/agent/ai-output.json", JSON.stringify(output, null, 2));
  return output;
}