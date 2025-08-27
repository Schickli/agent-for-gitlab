// Simple structured logger used across modules
const ts = () => new Date().toISOString();

export const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${ts()} ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${ts()} ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${ts()} ${msg}`, ...args),
  success: (msg, ...args) => console.log(`✅  ${msg}`, ...args),
  start: (msg, ...args) => console.log(`🚀  ${msg}`, ...args),
};

export default logger;
