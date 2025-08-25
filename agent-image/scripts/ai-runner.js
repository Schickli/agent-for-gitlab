#!/usr/bin/env node

// Thin entrypoint that delegates to the modular runner implementation.
import { run } from "./src/runner.js";

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal error:", error);
  process.exit(1);
});
