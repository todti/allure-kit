import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ConfigPatchOutcome, FrameworkDescriptor } from "@todti/allure-kit-core";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type { ConfigPatchOutcome };

interface ArrayPatchSpec {
  arrayKey: string;
  entryText: string;
}

const findExistingFile = async (cwd: string, patterns: string[]): Promise<string | null> => {
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
// (defineConfig(...), plain object export, CodeceptJS's module.exports.config / export const config).
// Doesn't handle configs built from a function body or spread from another module — those fall
// back to "unrecognized-shape".
const findConfigObjectOpenBrace = (text: string): number | null => {
  const patterns = [
    /export\s+default\s+defineConfig\s*\(\s*\{/,
    /module\.exports\s*=\s*defineConfig\s*\(\s*\{/,
    /export\s+default\s+\{/,
    /module\.exports\.config\s*=\s*\{/,
    /module\.exports\s*=\s*\{/,
    /export\s+const\s+config[^=]*=\s*\{/,
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

// ponytail: bounded 2000-char lookahead to keep matches scoped to the relevant nested block
// (test: {...}, default: {...}, plugins: {...}) instead of a same-named key elsewhere in the
// file. Widen if real configs exceed that width between the block's opening brace and its keys.
const WINDOW = 2000;

// Appends `appendEntryText` to `key`'s array if it's already an array; inserts a fresh
// `key: [fullArrayText],` property if `key` is absent; returns null if `key` exists but isn't
// an array — inserting a second same-named key would silently shadow it.
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

// Same idea as patchArrayKeyInRegion but for an object-literal key (e.g. plugins: { allure: {...} }).
const patchObjectKeyInRegion = (text: string, key: string, insertText: string, regionStart: number): string | null => {
  const window = text.slice(regionStart, regionStart + WINDOW);

  if (new RegExp(`\\b${key}\\s*:`).test(window)) {
    return null;
  }

  return `${text.slice(0, regionStart)}\n    ${key}: { ${insertText} },${text.slice(regionStart)}`;
};

interface NestedArrayEntry {
  key: string;
  appendEntryText: string;
  fullArrayText: string;
}

// Patches one or more array keys nested under `outerKey: { ... }` (e.g. Vitest's `test:` block,
// Cucumber's `default:` profile). Inserts the whole `outerKey: { ... }` block if it's absent.
const patchNestedArrayConfig = (text: string, outerKey: string, entries: NestedArrayEntry[]): string | null => {
  const outerBlock = new RegExp(`${outerKey}\\s*:\\s*\\{`).exec(text);

  if (!outerBlock) {
    const fullProps = entries.map((e) => `${e.key}: [${e.fullArrayText}],`).join(" ");

    return insertProperty(text, `${outerKey}: { ${fullProps} },`);
  }

  const braceEnd = outerBlock.index + outerBlock[0].length;
  let result = text;

  for (const entry of entries) {
    const patched = patchArrayKeyInRegion(result, entry.key, entry.appendEntryText, entry.fullArrayText, braceEnd);

    if (patched === null) {
      return null;
    }

    // Insertions in patchArrayKeyInRegion only ever happen at or after `braceEnd`, so it still
    // marks the start of the outer block's body — no offset recalculation needed between entries.
    result = patched;
  }

  return result;
};

const patchVitestConfig = (text: string): string | null =>
  patchNestedArrayConfig(text, "test", [
    {
      key: "reporters",
      appendEntryText: '"allure-vitest/reporter"',
      fullArrayText: '"default", "allure-vitest/reporter"',
    },
    { key: "setupFiles", appendEntryText: '"allure-vitest/setup"', fullArrayText: '"allure-vitest/setup"' },
  ]);

const patchJestConfig = (text: string, configPath: string): string | null => {
  if (configPath.endsWith(".json")) {
    const json = JSON.parse(text) as Record<string, unknown>;

    // A custom testEnvironment is already set — don't clobber it.
    if (json.testEnvironment) {
      return null;
    }

    json.testEnvironment = "allure-jest/environment";

    return `${JSON.stringify(json, null, 2)}\n`;
  }

  // Same reasoning as above, for the JS/TS/mjs/cjs shape.
  if (/testEnvironment\s*:/.test(text)) {
    return null;
  }

  return insertProperty(text, 'testEnvironment: "allure-jest/environment",');
};

const patchMochaConfig = (text: string, configPath: string): string | null => {
  if (configPath.endsWith(".json")) {
    const json = JSON.parse(text) as Record<string, unknown>;

    if (json.reporter) {
      return null;
    }

    json.reporter = "allure-mocha/reporter";

    return `${JSON.stringify(json, null, 2)}\n`;
  }

  if (configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
    const parsed = (parseYaml(text) ?? {}) as Record<string, unknown>;

    if (parsed.reporter) {
      return null;
    }

    parsed.reporter = "allure-mocha/reporter";

    return stringifyYaml(parsed);
  }

  // .mocharc.js / .cjs / .mjs
  if (/\breporter\s*:/.test(text)) {
    return null;
  }

  return insertProperty(text, 'reporter: "allure-mocha/reporter",');
};

const patchCucumberConfig = (text: string, configPath: string): string | null => {
  if (configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
    const parsed = (parseYaml(text) ?? {}) as Record<string, unknown>;
    const profile = parsed.default;

    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      // No "default" profile object (missing, or an old-style CLI-flag string profile) — can't
      // safely append a --format flag to an unknown shape.
      return null;
    }

    const profileObj = profile as Record<string, unknown>;

    if (profileObj.format === undefined) {
      profileObj.format = ["allure-cucumberjs/reporter"];
    } else if (Array.isArray(profileObj.format)) {
      profileObj.format.push("allure-cucumberjs/reporter");
    } else {
      return null;
    }

    return stringifyYaml(parsed);
  }

  return patchNestedArrayConfig(text, "default", [
    { key: "format", appendEntryText: '"allure-cucumberjs/reporter"', fullArrayText: '"allure-cucumberjs/reporter"' },
  ]);
};

const patchCodeceptConfig = (text: string): string | null => {
  const allureEntry = 'enabled: true, require: "allure-codeceptjs"';
  const pluginsBlock = /plugins\s*:\s*\{/.exec(text);

  if (!pluginsBlock) {
    return insertProperty(text, `plugins: { allure: { ${allureEntry} } },`);
  }

  const braceEnd = pluginsBlock.index + pluginsBlock[0].length;

  return patchObjectKeyInRegion(text, "allure", allureEntry, braceEnd);
};

const ALREADY_CONFIGURED: Record<string, (text: string) => boolean> = {
  playwright: (text) => text.includes("allure-playwright"),
  wdio: (text) => /['"]allure['"]/.test(text),
  vitest: (text) => text.includes("allure-vitest/reporter"),
  jest: (text) => text.includes("allure-jest/environment"),
  mocha: (text) => text.includes("allure-mocha/reporter"),
  cucumberjs: (text) => text.includes("allure-cucumberjs/reporter"),
  codeceptjs: (text) => text.includes("allure-codeceptjs"),
};

// Cypress needs two files: the plugin registered in setupNodeEvents (cypress.config.*) and an
// import in the support file (cypress/support/e2e.{ts,js}). Handled outside the generic
// single-file flow below.
const CYPRESS_SETUP_NODE_EVENTS_PATTERNS = [
  /setupNodeEvents\s*:\s*\(\s*on\s*,\s*config\s*\)\s*=>\s*\{/,
  /setupNodeEvents\s*\(\s*on\s*,\s*config\s*\)\s*\{/,
  /setupNodeEvents\s*:\s*function\s*\(\s*on\s*,\s*config\s*\)\s*\{/,
];

const CYPRESS_SUPPORT_FILE_CANDIDATES = ["cypress/support/e2e.ts", "cypress/support/e2e.js"];

const patchCypressConfigFile = (text: string): string | null => {
  let match: RegExpExecArray | null = null;

  for (const pattern of CYPRESS_SETUP_NODE_EVENTS_PATTERNS) {
    match = pattern.exec(text);

    if (match) {
      break;
    }
  }

  // No recognizable setupNodeEvents(on, config) function — could be missing, or use a signature
  // (e.g. destructured/renamed params) we don't try to guess at.
  if (!match) {
    return null;
  }

  const insertAt = match.index + match[0].length;
  let result = `${text.slice(0, insertAt)}\n      allureCypress(on, config);${text.slice(insertAt)}`;

  if (!result.includes('from "allure-cypress/reporter"') && !result.includes("from 'allure-cypress/reporter'")) {
    result = `import { allureCypress } from "allure-cypress/reporter";\n${result}`;
  }

  return result;
};

const patchCypressFramework = async (cwd: string, framework: FrameworkDescriptor): Promise<ConfigPatchOutcome> => {
  const configPath = await findExistingFile(cwd, framework.configFilePatterns);

  if (!configPath) {
    return { status: "no-config-file" };
  }

  const text = await readFile(configPath, "utf-8");

  if (text.includes("allureCypress(")) {
    return { status: "already-configured", configPath };
  }

  const patchedConfig = patchCypressConfigFile(text);

  if (patchedConfig === null) {
    return { status: "unrecognized-shape", configPath };
  }

  await writeFile(configPath, patchedConfig, "utf-8");

  const supportFile = await findExistingFile(cwd, CYPRESS_SUPPORT_FILE_CANDIDATES);

  if (!supportFile) {
    return {
      status: "patched",
      configPath,
      note: 'No cypress/support/e2e.{ts,js} found — add `import "allure-cypress";` there too.',
    };
  }

  const supportText = await readFile(supportFile, "utf-8");

  if (!supportText.includes("allure-cypress")) {
    await writeFile(supportFile, `import "allure-cypress";\n${supportText}`, "utf-8");
  }

  return { status: "patched", configPath };
};

// Jasmine's own config (spec/support/jasmine.json) never mentions Allure — the reporter is
// registered from a helper file that the "helpers" glob already picks up. We only handle the
// common `"<dir>/**/*.<js|ts>"` glob shape; anything else falls back to the printed hint.
const deriveJasmineHelperTarget = (helpers: unknown): { dir: string; ext: "js" | "ts" } | null => {
  if (!Array.isArray(helpers)) {
    return null;
  }

  for (const pattern of helpers) {
    if (typeof pattern !== "string") {
      continue;
    }

    const match = /^([\w./-]+?)\/\*\*\/\*\.(js|ts)$/.exec(pattern);

    if (match) {
      return { dir: match[1], ext: match[2] as "js" | "ts" };
    }
  }

  return null;
};

const patchJasmineFramework = async (cwd: string, framework: FrameworkDescriptor): Promise<ConfigPatchOutcome> => {
  const configPath = await findExistingFile(cwd, framework.configFilePatterns);

  if (!configPath) {
    return { status: "no-config-file" };
  }

  let json: Record<string, unknown>;

  try {
    json = JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return { status: "unrecognized-shape", configPath };
  }

  const target = deriveJasmineHelperTarget(json.helpers);

  if (!target) {
    return { status: "unrecognized-shape", configPath };
  }

  const helperDir = resolve(cwd, target.dir);
  const helperPath = resolve(helperDir, `allure.reporter.${target.ext}`);

  try {
    const existing = await readFile(helperPath, "utf-8");

    return {
      status: existing.includes("allure-jasmine") ? "already-configured" : "unrecognized-shape",
      configPath: helperPath,
    };
  } catch {
    // Helper doesn't exist yet — create it below.
  }

  const content =
    target.ext === "ts"
      ? 'import AllureJasmineReporter from "allure-jasmine";\n\njasmine.getEnv().addReporter(new AllureJasmineReporter());\n'
      : 'const AllureJasmineReporter = require("allure-jasmine");\n\njasmine.getEnv().addReporter(new AllureJasmineReporter());\n';

  await mkdir(helperDir, { recursive: true });
  await writeFile(helperPath, content, "utf-8");

  return { status: "patched", configPath: helperPath };
};

export type FrameworkWiringStatus = "wired" | "not-wired" | "no-config-file" | "unsupported";

// Read-only version of the "already configured?" check patchFrameworkConfig makes before
// writing anything — for `doctor` to report on without touching any files.
export const checkFrameworkWiring = async (cwd: string, framework: FrameworkDescriptor): Promise<FrameworkWiringStatus> => {
  if (framework.id === "cypress") {
    const configPath = await findExistingFile(cwd, framework.configFilePatterns);

    if (!configPath) {
      return "no-config-file";
    }

    const text = await readFile(configPath, "utf-8");

    return text.includes("allureCypress(") ? "wired" : "not-wired";
  }

  if (framework.id === "jasmine") {
    const configPath = await findExistingFile(cwd, framework.configFilePatterns);

    if (!configPath) {
      return "no-config-file";
    }

    let json: Record<string, unknown>;

    try {
      json = JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      return "not-wired";
    }

    const target = deriveJasmineHelperTarget(json.helpers);

    if (!target) {
      return "not-wired";
    }

    try {
      const helperPath = resolve(resolve(cwd, target.dir), `allure.reporter.${target.ext}`);
      const existing = await readFile(helperPath, "utf-8");

      return existing.includes("allure-jasmine") ? "wired" : "not-wired";
    } catch {
      return "not-wired";
    }
  }

  const alreadyConfigured = ALREADY_CONFIGURED[framework.id];

  if (!alreadyConfigured) {
    return "unsupported";
  }

  const configPath = await findExistingFile(cwd, framework.configFilePatterns);

  if (!configPath) {
    return "no-config-file";
  }

  const text = await readFile(configPath, "utf-8");

  return alreadyConfigured(text) ? "wired" : "not-wired";
};

export const patchFrameworkConfig = async (
  cwd: string,
  framework: FrameworkDescriptor,
): Promise<ConfigPatchOutcome> => {
  if (framework.id === "cypress") {
    return patchCypressFramework(cwd, framework);
  }

  if (framework.id === "jasmine") {
    return patchJasmineFramework(cwd, framework);
  }

  const alreadyConfigured = ALREADY_CONFIGURED[framework.id];

  if (!alreadyConfigured) {
    return { status: "unsupported" };
  }

  const configPath = await findExistingFile(cwd, framework.configFilePatterns);

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
    case "mocha":
      patchedText = patchMochaConfig(text, configPath);
      break;
    case "cucumberjs":
      patchedText = patchCucumberConfig(text, configPath);
      break;
    case "codeceptjs":
      patchedText = patchCodeceptConfig(text);
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
