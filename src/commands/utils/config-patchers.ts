import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { FrameworkDescriptor } from "./registry.js";

export interface ConfigPatchOutcome {
  status: "patched" | "already-configured" | "no-config-file" | "unsupported" | "unrecognized-shape";
  configPath?: string;
}

interface ArrayPatchSpec {
  arrayKey: string;
  entryText: string;
}

const findExistingConfigFile = async (cwd: string, patterns: string[]): Promise<string | null> => {
  for (const pattern of patterns) {
    const filePath = resolve(cwd, pattern);

    try {
      await access(filePath);

      return filePath;
    } catch {
      continue;
    }
  }

  return null;
};

// Matches the opening brace of the exported config object across the common scaffold shapes
// (defineConfig(...), plain object export). Doesn't handle configs built from a function body
// or spread from another module — those fall back to "unrecognized-shape".
const findConfigObjectOpenBrace = (text: string): number | null => {
  const patterns = [
    /export\s+default\s+defineConfig\s*\(\s*\{/,
    /module\.exports\s*=\s*defineConfig\s*\(\s*\{/,
    /export\s+default\s+\{/,
    /module\.exports\s*=\s*\{/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);

    if (match) {
      return match.index + match[0].length;
    }
  }

  return null;
};

const insertProperty = (text: string, propertyText: string): string | null => {
  const openBrace = findConfigObjectOpenBrace(text);

  if (openBrace === null) {
    return null;
  }

  return `${text.slice(0, openBrace)}\n  ${propertyText}${text.slice(openBrace)}`;
};

const patchArrayFramework = (text: string, spec: ArrayPatchSpec): string | null => {
  const arrayRegex = new RegExp(`${spec.arrayKey}\\s*:\\s*\\[`);
  const match = arrayRegex.exec(text);

  if (match) {
    const insertAt = match.index + match[0].length;

    return `${text.slice(0, insertAt)}${spec.entryText}, ${text.slice(insertAt)}`;
  }

  // Key exists but isn't an array (e.g. reporter: 'html') — don't blindly add a second
  // `reporter:` property, that would silently shadow the user's value at runtime.
  const keyExistsRegex = new RegExp(`\\b${spec.arrayKey}\\s*:`);

  if (keyExistsRegex.test(text)) {
    return null;
  }

  return insertProperty(text, `${spec.arrayKey}: [${spec.entryText}],`);
};

// ponytail: bounded 2000-char lookahead to keep reporters/setupFiles matches scoped to the
// test: {...} block instead of a same-named key elsewhere in the file. Widen if real configs
// exceed that width between "test:" and its array properties.
const WINDOW = 2000;

// Appends `appendEntryText` to `key`'s array if it's already an array; inserts a fresh
// `key: [fullArrayText],` property if `key` is absent; returns null if `key` exists but isn't
// an array (e.g. setupFiles: "./setup.ts") — inserting a second same-named key would silently
// shadow it.
const patchArrayKeyInRegion = (
  text: string,
  key: string,
  appendEntryText: string,
  fullArrayText: string,
  regionStart: number,
): string | null => {
  const window = text.slice(regionStart, regionStart + WINDOW);
  const arrayMatch = new RegExp(`${key}\\s*:\\s*\\[`).exec(window);

  if (arrayMatch) {
    const at = regionStart + arrayMatch.index + arrayMatch[0].length;

    return `${text.slice(0, at)}${appendEntryText}, ${text.slice(at)}`;
  }

  if (new RegExp(`\\b${key}\\s*:`).test(window)) {
    return null;
  }

  return `${text.slice(0, regionStart)}\n    ${key}: [${fullArrayText}],${text.slice(regionStart)}`;
};

const patchVitestConfig = (text: string): string | null => {
  const testBlock = /test\s*:\s*\{/.exec(text);

  if (!testBlock) {
    return insertProperty(
      text,
      'test: { reporters: ["default", "allure-vitest/reporter"], setupFiles: ["allure-vitest/setup"] },',
    );
  }

  const braceEnd = testBlock.index + testBlock[0].length;
  const afterReporters = patchArrayKeyInRegion(
    text,
    "reporters",
    '"allure-vitest/reporter"',
    '"default", "allure-vitest/reporter"',
    braceEnd,
  );

  if (afterReporters === null) {
    return null;
  }

  // Insertions in patchArrayKeyInRegion only ever happen at or after `braceEnd`, so it still
  // marks the start of the test: {...} body in the updated text — no offset recalculation needed.
  return patchArrayKeyInRegion(afterReporters, "setupFiles", '"allure-vitest/setup"', '"allure-vitest/setup"', braceEnd);
};

const patchJestConfig = (text: string, configPath: string): string | null => {
  if (configPath.endsWith(".json")) {
    const json = JSON.parse(text) as Record<string, unknown>;

    json.testEnvironment = "allure-jest/environment";

    return `${JSON.stringify(json, null, 2)}\n`;
  }

  return insertProperty(text, 'testEnvironment: "allure-jest/environment",');
};

const ALREADY_CONFIGURED: Record<string, (text: string) => boolean> = {
  playwright: (text) => text.includes("allure-playwright"),
  wdio: (text) => /['"]allure['"]/.test(text),
  vitest: (text) => text.includes("allure-vitest/reporter"),
  jest: (text) => text.includes("allure-jest/environment") || /testEnvironment\s*:/.test(text),
};

export const patchFrameworkConfig = async (
  cwd: string,
  framework: FrameworkDescriptor,
): Promise<ConfigPatchOutcome> => {
  const alreadyConfigured = ALREADY_CONFIGURED[framework.id];

  if (!alreadyConfigured) {
    return { status: "unsupported" };
  }

  const configPath = await findExistingConfigFile(cwd, framework.configFilePatterns);

  if (!configPath) {
    return { status: "no-config-file" };
  }

  const text = await readFile(configPath, "utf-8");

  if (alreadyConfigured(text)) {
    return { status: "already-configured", configPath };
  }

  let patchedText: string | null;

  switch (framework.id) {
    case "playwright":
      patchedText = patchArrayFramework(text, { arrayKey: "reporter", entryText: '["allure-playwright"]' });
      break;
    case "wdio":
      patchedText = patchArrayFramework(text, {
        arrayKey: "reporters",
        entryText: '["allure", { outputDir: "allure-results" }]',
      });
      break;
    case "vitest":
      patchedText = patchVitestConfig(text);
      break;
    case "jest":
      patchedText = patchJestConfig(text, configPath);
      break;
    default:
      return { status: "unsupported", configPath };
  }

  if (patchedText === null) {
    return { status: "unrecognized-shape", configPath };
  }

  await writeFile(configPath, patchedText, "utf-8");

  return { status: "patched", configPath };
};
