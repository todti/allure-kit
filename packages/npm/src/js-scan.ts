/**
 * Minimal lexical scanner for JS/TS config files. It is not a parser: it only knows enough (strings,
 * template literals, comments, bracket nesting) to answer "which properties does *this* object literal
 * have at its top level", so patchers never mistake a same-named key in a nested block, a comment or a
 * string for the real one. Regex literals are not recognised.
 */

const OPENERS = new Set(["{", "[", "("]);
const CLOSERS = new Set(["}", "]", ")"]);

/** If `text[i]` starts a string, template literal or comment, returns the index just past it; otherwise `i`. */
const skipTrivia = (text: string, i: number): number => {
  const char = text[i];
  const next = text[i + 1];

  if (char === "/" && next === "/") {
    const end = text.indexOf("\n", i);

    return end === -1 ? text.length : end + 1;
  }

  if (char === "/" && next === "*") {
    const end = text.indexOf("*/", i + 2);

    return end === -1 ? text.length : end + 2;
  }

  if (char === '"' || char === "'") {
    let j = i + 1;

    while (j < text.length && text[j] !== char && text[j] !== "\n") {
      j += text[j] === "\\" ? 2 : 1;
    }

    return j + 1;
  }

  if (char === "`") {
    let j = i + 1;

    while (j < text.length && text[j] !== "`") {
      if (text[j] === "\\") {
        j += 2;
      } else if (text[j] === "$" && text[j + 1] === "{") {
        j = (findMatchingBracket(text, j + 1) ?? text.length) + 1;
      } else {
        j++;
      }
    }

    return j + 1;
  }

  return i;
};

/** Index of the bracket closing the one at `openIdx`, or null if unbalanced. */
export const findMatchingBracket = (text: string, openIdx: number): number | null => {
  let depth = 0;
  let i = openIdx;

  while (i < text.length) {
    const skipped = skipTrivia(text, i);

    if (skipped !== i) {
      i = skipped;
      continue;
    }

    if (OPENERS.has(text[i])) {
      depth++;
    } else if (CLOSERS.has(text[i])) {
      depth--;

      if (depth === 0) {
        return i;
      }
    }

    i++;
  }

  return null;
};

export interface TopLevelProperty {
  /** Index of the first character of the key. */
  keyStart: number;
  /** Index of the first character of the value (after the colon and whitespace). */
  valueStart: number;
}

/** Finds `key:` among the direct properties of the object literal opened at `openIdx` (`text[openIdx] === "{"`). */
export const findTopLevelProperty = (text: string, openIdx: number, key: string): TopLevelProperty | null => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const property = new RegExp(`(?:"${escaped}"|'${escaped}'|\\b${escaped}\\b)\\s*:\\s*`, "y");
  let depth = 0;
  let previous = "";
  let i = openIdx;

  while (i < text.length) {
    const skipped = skipTrivia(text, i);

    if (skipped !== i) {
      // A string can be a quoted key, so only skip it when it isn't the property we're after.
      if (depth === 1 && (previous === "{" || previous === ",")) {
        property.lastIndex = i;
        const match = property.exec(text);

        if (match) {
          return { keyStart: i, valueStart: i + match[0].length };
        }
      }

      previous = "x";
      i = skipped;
      continue;
    }

    const char = text[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (depth === 1 && (previous === "{" || previous === ",")) {
      property.lastIndex = i;
      const match = property.exec(text);

      if (match) {
        return { keyStart: i, valueStart: i + match[0].length };
      }
    }

    if (OPENERS.has(char)) {
      depth++;
    } else if (CLOSERS.has(char)) {
      depth--;

      if (depth === 0) {
        return null;
      }
    }

    previous = char;
    i++;
  }

  return null;
};

/** True when the object literal opened at `openIdx` has a direct `...spread` member. */
export const hasTopLevelSpread = (text: string, openIdx: number): boolean => {
  let depth = 0;
  let previous = "";
  let i = openIdx;

  while (i < text.length) {
    const skipped = skipTrivia(text, i);

    if (skipped !== i) {
      previous = "x";
      i = skipped;
      continue;
    }

    const char = text[i];

    if (/\s/.test(char)) {
      i++;
      continue;
    }

    if (depth === 1 && (previous === "{" || previous === ",") && text.startsWith("...", i)) {
      return true;
    }

    if (OPENERS.has(char)) {
      depth++;
    } else if (CLOSERS.has(char)) {
      depth--;

      if (depth === 0) {
        return false;
      }
    }

    previous = char;
    i++;
  }

  return false;
};
