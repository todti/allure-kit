import { findTopLevelProperty, skipValue } from "./js-scan.js";

/**
 * Text-level editing of an ESM/CommonJS `allurerc` (the file can't be parsed back, because it is executable code).
 * Only literal object configs are supported; anything else returns null so callers can fall back to printing a snippet.
 */

const CONFIG_OBJECT_PATTERNS = [
  /export\s+default\s+defineConfig\s*\(\s*\{/,
  /module\.exports\s*=\s*defineConfig\s*\(\s*\{/,
  /export\s+default\s+\{/,
  /module\.exports\s*=\s*\{/,
];

/** Index of the `{` of the exported config object, or null when it isn't a literal. */
export const findMjsConfigBrace = (source: string): number | null => {
  for (const pattern of CONFIG_OBJECT_PATTERNS) {
    const match = pattern.exec(source);

    if (match) {
      return match.index + match[0].length - 1;
    }
  }

  return null;
};

const insertAfterBrace = (source: string, braceIdx: number, text: string, indent: string) =>
  `${source.slice(0, braceIdx + 1)}\n${indent}${text}${source.slice(braceIdx + 1)}`;

/** Resolves a dotted path to the `{` of the object holding its last segment, creating nothing. */
const descend = (source: string, braceIdx: number, parents: string[]): number | null | undefined => {
  let brace = braceIdx;

  for (const segment of parents) {
    const property = findTopLevelProperty(source, brace, segment);

    if (!property) {
      return undefined;
    }

    if (source[property.valueStart] !== "{") {
      return null;
    }

    brace = property.valueStart;
  }

  return brace;
};

/** Sets `path` (e.g. ["historyPath"] or ["flakyDetection", "historyDepth"]) to a JSON-serialisable value. */
export const setMjsOption = (source: string, path: string[], value: unknown): string | null => {
  const root = findMjsConfigBrace(source);

  if (root === null) {
    return null;
  }

  const literal = JSON.stringify(value);
  const last = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const brace = descend(source, root, parentPath);

  if (brace === null) {
    return null;
  }

  if (brace === undefined) {
    // A missing parent object: create the whole remaining chain in one go.
    let existing = root;
    let depth = 0;

    for (const segment of parentPath) {
      const property = findTopLevelProperty(source, existing, segment);

      if (!property) {
        break;
      }

      existing = property.valueStart;
      depth++;
    }

    const missing = [...parentPath.slice(depth), last];
    const nested = missing.slice(1).reduceRight<string>((inner, key) => `{ ${key}: ${inner} }`, literal);

    return insertAfterBrace(source, existing, `${missing[0]}: ${nested},`, "  ");
  }

  const property = findTopLevelProperty(source, brace, last);

  if (!property) {
    return insertAfterBrace(source, brace, `${last}: ${literal},`, "  ");
  }

  return `${source.slice(0, property.valueStart)}${literal}${source.slice(skipValue(source, property.valueStart))}`;
};

/** Removes the property at `path`; returns the source unchanged when it isn't there. */
export const unsetMjsOption = (source: string, path: string[]): string | null => {
  const root = findMjsConfigBrace(source);

  if (root === null) {
    return null;
  }

  const brace = descend(source, root, path.slice(0, -1));

  if (brace === null) {
    return null;
  }

  if (brace === undefined) {
    return source;
  }

  const property = findTopLevelProperty(source, brace, path[path.length - 1]);

  if (!property) {
    return source;
  }

  let start = property.keyStart;
  let end = skipValue(source, property.valueStart);

  while (start > 0 && " \t".includes(source[start - 1])) {
    start--;
  }

  if (source[start - 1] === "\n") {
    start--;
  }

  while (" \t".includes(source[end] ?? "")) {
    end++;
  }

  if (source[end] === ",") {
    end++;
  }

  return `${source.slice(0, start)}${source.slice(end)}`;
};

/** Adds `plugins.<id>`; null if `plugins` exists but isn't an object literal, or the plugin is already there. */
export const addMjsPlugin = (source: string, id: string, entry: unknown): string | null => {
  const root = findMjsConfigBrace(source);

  if (root === null) {
    return null;
  }

  const plugins = findTopLevelProperty(source, root, "plugins");

  if (!plugins) {
    return insertAfterBrace(source, root, `plugins: { ${JSON.stringify(id)}: ${JSON.stringify(entry)} },`, "  ");
  }

  if (source[plugins.valueStart] !== "{" || findTopLevelProperty(source, plugins.valueStart, id)) {
    return null;
  }

  return insertAfterBrace(source, plugins.valueStart, `${JSON.stringify(id)}: ${JSON.stringify(entry)},`, "    ");
};

export const removeMjsPlugin = (source: string, id: string): string | null => {
  const root = findMjsConfigBrace(source);
  const plugins = root === null ? null : findTopLevelProperty(source, root, "plugins");

  if (!plugins || source[plugins.valueStart] !== "{") {
    return null;
  }

  return unsetMjsOption(source, ["plugins", id]);
};
