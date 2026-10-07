import { cwd as processCwd } from "node:process";

import {
  findExistingConfig,
  logError,
  logHint,
  logSuccess,
  logWarning,
  readAllureConfig,
  writeAllureConfig,
} from "@todti/allure-kit-core";
import { Command, Option, UsageError } from "clipanion";

/** Top-level allurerc settings that `config set` manages (dotted keys address nested objects). */
export const CONFIG_KEYS = [
  "resultsDir",
  "historyPath",
  "historyBaseUrl",
  "knownIssuesPath",
  "flakyDetection.historyDepth",
  "flakyDetection.includePassedTests",
];

const parseValue = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const loadEditableConfig = async (workingDir: string) => {
  const existing = await findExistingConfig(workingDir);

  if (!existing) {
    logError("No allurerc config found. Run 'allure-kit init' first to create one.");
    return null;
  }

  if (existing.format === "mjs") {
    logWarning("Cannot auto-modify ESM config (allurerc.mjs).");
    logHint("Edit the file manually.");
    return null;
  }

  const config = await readAllureConfig(workingDir);

  return config ? { config, format: existing.format } : null;
};

const assertKnownKey = (key: string) => {
  if (!CONFIG_KEYS.includes(key)) {
    throw new UsageError(`Unknown config key ${JSON.stringify(key)}. Supported: ${CONFIG_KEYS.join(", ")}.`);
  }
};

export class KitConfigSetCommand extends Command {
  static paths = [["config", "set"]];

  static usage = Command.Usage({
    description: "Set a top-level Allure config option",
    details: `Supported keys: ${CONFIG_KEYS.join(", ")}. Values are parsed as JSON when possible (numbers, booleans).`,
    examples: [
      ["config set resultsDir ./allure-results", "Scope results discovery to a directory"],
      ["config set flakyDetection.historyDepth 10", "Enable history-based flaky detection depth"],
    ],
  });

  key = Option.String({ required: true, name: "key" });
  value = Option.String({ required: true, name: "value" });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    assertKnownKey(this.key);

    const workingDir = this.cwd ?? processCwd();
    const loaded = await loadEditableConfig(workingDir);

    if (!loaded) {
      return;
    }

    const path = this.key.split(".");
    const last = path.pop()!;
    let target = loaded.config as Record<string, unknown>;

    for (const segment of path) {
      const next = target[segment];

      target = target[segment] = next && typeof next === "object" ? (next as Record<string, unknown>) : {};
    }

    target[last] = parseValue(this.value);

    await writeAllureConfig(workingDir, loaded.config, loaded.format);
    logSuccess(`Set ${this.key} = ${JSON.stringify(target[last])}`);
  }
}

export class KitConfigGetCommand extends Command {
  static paths = [["config", "get"]];

  static usage = Command.Usage({
    description: "Print a top-level Allure config option",
    examples: [["config get resultsDir", "Print the configured results directory"]],
  });

  key = Option.String({ required: true, name: "key" });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    assertKnownKey(this.key);

    const loaded = await loadEditableConfig(this.cwd ?? processCwd());

    if (!loaded) {
      return;
    }

    const value = this.key
      .split(".")
      .reduce<unknown>((node, segment) => (node as Record<string, unknown> | undefined)?.[segment], loaded.config);

    this.context.stdout.write(`${value === undefined ? "" : JSON.stringify(value)}\n`);
  }
}

const getByPath = (config: object, key: string): unknown =>
  key.split(".").reduce<unknown>((node, segment) => (node as Record<string, unknown> | undefined)?.[segment], config);

export class KitConfigListCommand extends Command {
  static paths = [["config", "list"]];

  static usage = Command.Usage({
    description: "Print all supported Allure config options that are currently set",
    examples: [["config list", "Show configured resultsDir, history and flakyDetection options"]],
  });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    const loaded = await loadEditableConfig(this.cwd ?? processCwd());

    if (!loaded) {
      return;
    }

    for (const key of CONFIG_KEYS) {
      const value = getByPath(loaded.config, key);

      if (value !== undefined) {
        this.context.stdout.write(`${key} = ${JSON.stringify(value)}\n`);
      }
    }
  }
}

export class KitConfigUnsetCommand extends Command {
  static paths = [["config", "unset"]];

  static usage = Command.Usage({
    description: "Remove a top-level Allure config option",
    examples: [["config unset flakyDetection.historyDepth", "Remove the option (an emptied parent object is removed too)"]],
  });

  key = Option.String({ required: true, name: "key" });

  cwd = Option.String("--cwd", {
    description: "Working directory (default: current directory)",
  });

  async execute() {
    assertKnownKey(this.key);

    const workingDir = this.cwd ?? processCwd();
    const loaded = await loadEditableConfig(workingDir);

    if (!loaded) {
      return;
    }

    const path = this.key.split(".");
    const last = path.pop()!;
    const parents: Record<string, unknown>[] = [loaded.config];

    for (const segment of path) {
      const next = (parents[parents.length - 1] as Record<string, unknown>)[segment];

      if (!next || typeof next !== "object") {
        logWarning(`${this.key} is not set`);

        return;
      }

      parents.push(next as Record<string, unknown>);
    }

    if (!(last in parents[parents.length - 1])) {
      logWarning(`${this.key} is not set`);

      return;
    }

    delete parents[parents.length - 1][last];

    for (let depth = parents.length - 1; depth > 0; depth--) {
      if (Object.keys(parents[depth]).length > 0) {
        break;
      }

      delete parents[depth - 1][path[depth - 1]];
    }

    await writeAllureConfig(workingDir, loaded.config, loaded.format);
    logSuccess(`Removed ${this.key}`);
  }
}
