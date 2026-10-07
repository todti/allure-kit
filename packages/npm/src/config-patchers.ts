import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { type ConfigPatchOutcome, type FileWriter, type FrameworkDescriptor, findTopLevelProperty, hasTopLevelSpread } from "@todti/allure-kit-core";
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
    /(?:module\.)?exports\.config\s*=\s*\{/,
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

  // A `...spread` of another config may define the same key later in the literal and silently override ours.
  if (hasTopLevelSpread(text, openBrace - 1)) {
    return null;
  }

  return `${text.slice(0, openBrace)}\n  ${propertyText}${text.slice(openBrace)}`;
};

/**
 * Looks up `key` among the *direct* properties of the config object literal (not in nested blocks, comments or
 * strings). Returns `undefined` when the file has no recognisable config object so callers can fall back to the
 * looser text search; `null` when the object exists but doesn't have the key.
 */
const findConfigProperty = (text: string, key: string) => {
  const afterBrace = findConfigObjectOpenBrace(text);

  return afterBrace === null ? undefined : findTopLevelProperty(text, afterBrace - 1, key);
};

const hasTopLevelKey = (text: string, key: string): boolean => {
  const property = findConfigProperty(text, key);

  return property === undefined ? new RegExp(`\\b${key}\\s*:`).test(text) : property !== null;
};

const patchArrayFramework = (text: string, spec: ArrayPatchSpec): string | null => {
  const property = findConfigProperty(text, spec.arrayKey);

  if (property === undefined) {
    // No recognisable config object (e.g. `const config = {...}; export default config`): fall back to a text search.
    const loose = new RegExp(`${spec.arrayKey}\\s*:\\s*\\[`).exec(text);

    return loose ? `${text.slice(0, loose.index + loose[0].length)}${spec.entryText}, ${text.slice(loose.index + loose[0].length)}` : null;
  }

  if (property) {
    // Key exists but isn't an array (e.g. reporter: 'html') — don't add a second `reporter:`, that would
    // silently shadow the user's value at runtime.
    return text[property.valueStart] === "["
      ? `${text.slice(0, property.valueStart + 1)}${spec.entryText}, ${text.slice(property.valueStart + 1)}`
      : null;
  }

  return insertProperty(text, `${spec.arrayKey}: [${spec.entryText}],`);
};

// Appends `appendEntryText` to `key`'s array if it's already an array; inserts a fresh
// `key: [fullArrayText],` property if `key` is absent; returns null if `key` exists but isn't
// an array — inserting a second same-named key would silently shadow it. `regionStart` is the index just
// past the `{` of the block that should own `key`.
const patchArrayKeyInRegion = (
  text: string,
  key: string,
  appendEntryText: string,
  fullArrayText: string,
  regionStart: number,
): string | null => {
  const property = findTopLevelProperty(text, regionStart - 1, key);

  if (property) {
    return text[property.valueStart] === "["
      ? `${text.slice(0, property.valueStart + 1)}${appendEntryText}, ${text.slice(property.valueStart + 1)}`
      : null;
  }

  return `${text.slice(0, regionStart)}\n    ${key}: [${fullArrayText}],${text.slice(regionStart)}`;
};

// Same idea as patchArrayKeyInRegion but for an object-literal key (e.g. plugins: { allure: {...} }).
const patchObjectKeyInRegion = (text: string, key: string, insertText: string, regionStart: number): string | null => {
  if (findTopLevelProperty(text, regionStart - 1, key)) {
    return null;
  }

  return `${text.slice(0, regionStart)}\n    ${key}: { ${insertText} },${text.slice(regionStart)}`;
};

/** Index just past the `{` of the object-literal value of a top-level config key; null if the key is absent or not an object. */
const findNestedBlock = (text: string, key: string): number | null | undefined => {
  const property = findConfigProperty(text, key);

  if (property === undefined) {
    const loose = new RegExp(`${key}\\s*:\\s*\\{`).exec(text);

    return loose ? loose.index + loose[0].length : null;
  }

  if (property === null) {
    return null;
  }

  // The key exists but isn't an object literal (e.g. a spread-in variable): signal "can't patch".
  return text[property.valueStart] === "{" ? property.valueStart + 1 : undefined;
};

interface NestedArrayEntry {
  key: string;
  appendEntryText: string;
  fullArrayText: string;
}

// Patches one or more array keys nested under `outerKey: { ... }` (e.g. Vitest's `test:` block,
// Cucumber's `default:` profile). Inserts the whole `outerKey: { ... }` block if it's absent.
const patchNestedArrayConfig = (text: string, outerKey: string, entries: NestedArrayEntry[]): string | null => {
  const braceEnd = findNestedBlock(text, outerKey);

  if (braceEnd === undefined) {
    return null;
  }

  if (braceEnd === null) {
    const fullProps = entries.map((e) => `${e.key}: [${e.fullArrayText}],`).join(" ");

    return insertProperty(text, `${outerKey}: { ${fullProps} },`);
  }

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

    json.testEnvironment = "allure-jest/node";

    return `${JSON.stringify(json, null, 2)}\n`;
  }

  // Same reasoning as above, for the JS/TS/mjs/cjs shape.
  if (hasTopLevelKey(text, "testEnvironment")) {
    return null;
  }

  return insertProperty(text, 'testEnvironment: "allure-jest/node",');
};

const patchMochaConfig = (text: string, configPath: string): string | null => {
  if (configPath.endsWith(".json")) {
    const json = JSON.parse(text) as Record<string, unknown>;

    if (json.reporter) {
      return null;
    }

    json.reporter = "allure-mocha";

    return `${JSON.stringify(json, null, 2)}\n`;
  }

  if (configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
    const parsed = (parseYaml(text) ?? {}) as Record<string, unknown>;

    if (parsed.reporter) {
      return null;
    }

    parsed.reporter = "allure-mocha";

    return stringifyYaml(parsed);
  }

  // .mocharc.js / .cjs / .mjs
  if (hasTopLevelKey(text, "reporter")) {
    return null;
  }

  return insertProperty(text, 'reporter: "allure-mocha",');
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
  const braceEnd = findNestedBlock(text, "plugins");

  if (braceEnd === undefined) {
    return null;
  }

  if (braceEnd === null) {
    return insertProperty(text, `plugins: { allure: { ${allureEntry} } },`);
  }

  return patchObjectKeyInRegion(text, "allure", allureEntry, braceEnd);
};

const EXISTING_KEY_EXPECTATIONS: Record<string, { key: string; expected: string }> = {
  playwright: { key: "reporter", expected: "an array" },
  wdio: { key: "reporters", expected: "an array" },
  vitest: { key: "test", expected: "an object literal with array-valued reporters/setupFiles" },
  jest: { key: "testEnvironment", expected: "unset" },
  mocha: { key: "reporter", expected: "unset" },
  cucumberjs: { key: "default", expected: "an object literal with an array-valued format" },
  codeceptjs: { key: "plugins", expected: "an object literal" },
};

/** Best-effort explanation of why a text config couldn't be patched, so the user knows what to adjust by hand. */
const explainUnpatchable = (frameworkId: string, text: string, configPath: string): string => {
  if (configPath.endsWith(".json") || configPath.endsWith(".yml") || configPath.endsWith(".yaml")) {
    const expectation = EXISTING_KEY_EXPECTATIONS[frameworkId];

    return expectation
      ? `\`${expectation.key}\` is already set to a value Allure can't extend automatically (expected ${expectation.expected})`
      : "the config has a shape the patcher doesn't recognise";
  }

  const afterBrace = findConfigObjectOpenBrace(text);

  if (afterBrace === null) {
    return "couldn't find the exported config object (expected `export default defineConfig({...})`, `export default {...}` or `module.exports = {...}`)";
  }

  const expectation = EXISTING_KEY_EXPECTATIONS[frameworkId];

  if (expectation && findTopLevelProperty(text, afterBrace - 1, expectation.key)) {
    return `\`${expectation.key}\` is already set to something other than ${expectation.expected}, so it was left alone instead of being shadowed`;
  }

  return "the config has a shape the patcher doesn't recognise";
};

/** Names earlier allure-kit versions wrote that don't exist in the adapter packages (so Jest/Mocha fail or silently ignore them). */
export const OUTDATED_WIRING: Record<string, { bad: string; use: string }> = {
  jest: { bad: "allure-jest/environment", use: "allure-jest/node" },
  mocha: { bad: "allure-mocha/reporter", use: "allure-mocha" },
};

const ALREADY_CONFIGURED: Record<string, (text: string) => boolean> = {
  playwright: (text) => text.includes("allure-playwright"),
  wdio: (text) => /['"]allure['"]/.test(text),
  vitest: (text) => text.includes("allure-vitest/reporter"),
  jest: (text) => /allure-jest\/(node|jsdom|factory)/.test(text),
  mocha: (text) => text.includes("allure-mocha"),
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

type ModuleStyle = "esm" | "cjs";

/**
 * Which `import` syntax is valid in this config: injecting an ES `import` into a CommonJS `cypress.config.js` throws
 * `SyntaxError: Cannot use import statement outside a module` on Node versions without module-syntax detection.
 */
const detectModuleStyle = (text: string, configPath: string, packageType: unknown): ModuleStyle => {
  if (/\.(ts|mts|mjs)$/.test(configPath)) {
    return "esm";
  }

  if (configPath.endsWith(".cjs")) {
    return "cjs";
  }

  if (/^\s*(import|export)\s/m.test(text)) {
    return "esm";
  }

  if (/\brequire\(|\bmodule\.exports\b/.test(text)) {
    return "cjs";
  }

  return packageType === "module" ? "esm" : "cjs";
};

const patchCypressConfigFile = (text: string, style: ModuleStyle): string | null => {
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

  if (!/allure-cypress\/reporter/.test(result)) {
    result =
      style === "esm"
        ? `import { allureCypress } from "allure-cypress/reporter";\n${result}`
        : `const { allureCypress } = require("allure-cypress/reporter");\n${result}`;
  }

  return result;
};

const writeToDisk: FileWriter = async (filePath, content) => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
};

const patchCypressFramework = async (
  cwd: string,
  framework: FrameworkDescriptor,
  write: FileWriter,
): Promise<ConfigPatchOutcome> => {
  const configPath = await findExistingFile(cwd, framework.configFilePatterns);

  if (!configPath) {
    return { status: "no-config-file" };
  }

  const text = await readFile(configPath, "utf-8");

  if (text.includes("allureCypress(")) {
    return { status: "already-configured", configPath };
  }

  let packageType: unknown;

  try {
    packageType = (JSON.parse(await readFile(resolve(cwd, "package.json"), "utf-8")) as { type?: unknown }).type;
  } catch {
    // no readable package.json: CommonJS is the Node default
  }

  const patchedConfig = patchCypressConfigFile(text, detectModuleStyle(text, configPath, packageType));

  if (patchedConfig === null) {
    return {
      status: "unrecognized-shape",
      configPath,
      reason: "no setupNodeEvents(on, config) function found (renamed or destructured parameters aren't handled)",
    };
  }

  await write(configPath, patchedConfig);

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
    await write(supportFile, `import "allure-cypress";\n${supportText}`);
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

const patchJasmineFramework = async (
  cwd: string,
  framework: FrameworkDescriptor,
  write: FileWriter,
): Promise<ConfigPatchOutcome> => {
  const configPath = await findExistingFile(cwd, framework.configFilePatterns);

  if (!configPath) {
    return { status: "no-config-file" };
  }

  let json: Record<string, unknown>;

  try {
    json = JSON.parse(await readFile(configPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return { status: "unrecognized-shape", configPath, reason: "the Jasmine config isn't valid JSON" };
  }

  const target = deriveJasmineHelperTarget(json.helpers);

  if (!target) {
    return {
      status: "unrecognized-shape",
      configPath,
      reason: '"helpers" is missing or isn\'t a "<dir>/**/*.js|ts" glob, so there is no folder to put the reporter helper in',
    };
  }

  // Jasmine resolves "helpers" globs relative to spec_dir, not the project root.
  const helperDir = resolve(cwd, typeof json.spec_dir === "string" ? json.spec_dir : "", target.dir);
  const helperPath = resolve(helperDir, `allure.reporter.${target.ext}`);

  try {
    const existing = await readFile(helperPath, "utf-8");

    return existing.includes("allure-jasmine")
      ? { status: "already-configured", configPath: helperPath }
      : {
          status: "unrecognized-shape",
          configPath: helperPath,
          reason: `${relative(cwd, helperPath)} already exists without the Allure reporter`,
        };
  } catch {
    // Helper doesn't exist yet — create it below.
  }

  const content =
    target.ext === "ts"
      ? 'import AllureJasmineReporter from "allure-jasmine";\n\njasmine.getEnv().addReporter(new AllureJasmineReporter());\n'
      : 'const AllureJasmineReporter = require("allure-jasmine");\n\njasmine.getEnv().addReporter(new AllureJasmineReporter());\n';

  await write(helperPath, content);

  return { status: "patched", configPath: helperPath };
};

export type FrameworkWiringStatus = "wired" | "not-wired" | "no-config-file" | "unsupported" | "outdated-name";

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
      const helperPath = resolve(cwd, typeof json.spec_dir === "string" ? json.spec_dir : "", target.dir, `allure.reporter.${target.ext}`);
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
  const outdated = OUTDATED_WIRING[framework.id];

  if (outdated && text.includes(outdated.bad)) {
    return "outdated-name";
  }

  return alreadyConfigured(text) ? "wired" : "not-wired";
};

export const patchFrameworkConfig = async (
  cwd: string,
  framework: FrameworkDescriptor,
  write: FileWriter = writeToDisk,
): Promise<ConfigPatchOutcome> => {
  if (framework.id === "cypress") {
    return patchCypressFramework(cwd, framework, write);
  }

  if (framework.id === "jasmine") {
    return patchJasmineFramework(cwd, framework, write);
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
    return { status: "unrecognized-shape", configPath, reason: explainUnpatchable(framework.id, text, configPath) };
  }

  await write(configPath, patchedText);

  return { status: "patched", configPath };
};
