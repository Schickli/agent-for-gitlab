export function extractPrompt(note, triggerPhrase) {
  if (typeof note !== "string") return "";
  const keyWord = triggerPhrase ?? "@ai";
  const regex = new RegExp(
    `${keyWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+([\\s\\S]*)`,
    "i",
  );
  const match = note.match(regex);
  return match ? match[1].trim() : "";
}
