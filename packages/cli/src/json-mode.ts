import { captureLogs, type LogEntry } from "@todti/allure-kit-core";
import type { Cli } from "clipanion";

/** Commands whose human output is made of core log calls and can therefore be returned as JSON (`doctor` has its own `--json`). */
const hasJsonOutput = (args: string[]): boolean => {
  const [first, second] = args;

  if (first === "plugin") {
    return second === "add" || second === "remove";
  }

  return ["init", "demo", "migrate", "update", "ci", "gh-pages", "gitlab"].includes(first ?? "");
};

export const wantsJson = (args: string[]): boolean => args.includes("--json") && hasJsonOutput(args.filter((arg) => arg !== "--json"));

export interface JsonResult {
  command: string[];
  ok: boolean;
  messages: LogEntry[];
  /** Usage errors and other text the CLI framework wrote itself. */
  error?: string;
}

/**
 * Runs the command with its output captured and returns it as a structured result: for scripts and AI agents that
 * shouldn't scrape colored text. Commands that would prompt must be run with `--yes`.
 */
export const runJson = async (cli: Cli, args: string[]): Promise<{ exitCode: number; result: JsonResult }> => {
  const command = args.filter((arg) => arg !== "--json");
  const capture = captureLogs();
  const written: string[] = [];
  const stream = { write: (chunk: string | Uint8Array) => (written.push(String(chunk)), true) };
  let exitCode: number;

  try {
    exitCode = await cli.run(command, { stdin: process.stdin, stdout: stream as never, stderr: stream as never, env: process.env, colorDepth: 1 } as never);
  } finally {
    capture.stop();
  }

  const error = written.join("").trim();

  return { exitCode, result: { command, ok: exitCode === 0, messages: capture.entries, ...(error ? { error } : {}) } };
};
