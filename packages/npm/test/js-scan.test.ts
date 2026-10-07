import { describe, expect, it } from "vitest";

import { findMatchingBracket, findTopLevelProperty } from "../src/js-scan.js";

const open = (text: string) => text.indexOf("{");

describe("npm/js-scan", () => {
  it("matches brackets across strings, template literals and comments", () => {
    const text = '{ a: "}", b: `${ {x: 1}.x }}`, /* } */ c: [1, 2] // }\n}';

    expect(findMatchingBracket(text, 0)).toBe(text.length - 1);
  });

  it("finds only direct properties of the object", () => {
    const text = `{ nested: { reporter: 1 }, // reporter: 2\n  list: [{ reporter: 3 }], reporter: ["html"] }`;
    const property = findTopLevelProperty(text, open(text), "reporter");

    expect(property && text.slice(property.valueStart, property.valueStart + 6)).toBe('["html');
  });

  it("returns null when the key only exists in nested blocks, comments or strings", () => {
    const text = `{ projects: [{ reporter: "x" }], note: "reporter: y", /* reporter: z */ other: 1 }`;

    expect(findTopLevelProperty(text, open(text), "reporter")).toBeNull();
  });

  it("recognises quoted keys and does not confuse key prefixes", () => {
    const text = `{ "reporter": "list", myreporter: 1 }`;

    expect(findTopLevelProperty(text, open(text), "reporter")).not.toBeNull();
    expect(findTopLevelProperty(`{ myreporter: 1 }`, 0, "reporter")).toBeNull();
  });
});
