import * as console from "node:console";

import colors from "yoctocolors";

export type LogLevel = "success" | "info" | "warning" | "error" | "step" | "hint" | "text";

export interface LogEntry {
  level: LogLevel;
  message: string;
}

let sink: ((entry: LogEntry) => void) | null = null;

/**
 * While capturing, nothing is printed: every log call is recorded instead. `--json` uses this to turn the human
 * output of a command into a structured list for scripts and AI agents.
 */
export const captureLogs = (): { entries: LogEntry[]; stop: () => void } => {
  const entries: LogEntry[] = [];

  sink = (entry) => entries.push(entry);

  return {
    entries,
    stop: () => {
      sink = null;
    },
  };
};

const emit = (level: LogLevel, message: string, format: (text: string) => string): void => {
  if (sink) {
    sink({ level, message });

    return;
  }

  console.log(format(message));
};

export const logSuccess = (message: string): void => emit("success", message, (text) => colors.green(`  ✓ ${text}`));

export const logInfo = (message: string): void => emit("info", message, (text) => colors.cyan(`  ℹ ${text}`));

export const logWarning = (message: string): void => emit("warning", message, (text) => colors.yellow(`  ⚠ ${text}`));

export const logError = (message: string): void => emit("error", message, (text) => colors.red(`  ✗ ${text}`));

export const logStep = (message: string): void => emit("step", message, (text) => colors.bold(`\n  ${text}`));

export const logHint = (message: string): void => emit("hint", message, (text) => colors.dim(`    ${text}`));

/** Plain output (banners, diffs, tool output): printed as is, or recorded as `text` while capturing. */
export const print = (message = ""): void => emit("text", message, (text) => text);

export const logNewLine = (): void => {
  if (!sink) {
    console.log();
  }
};
