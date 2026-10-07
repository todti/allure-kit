import { describe, expect, it } from "vitest";

import { addMjsPlugin, findMjsConfigBrace, removeMjsPlugin, setMjsOption, unsetMjsOption } from "../src/mjs-config.js";

const config = `import { defineConfig } from "allure";

export default defineConfig({
  name: "My Report",
  historyPath: "./history.jsonl",
  flakyDetection: { historyDepth: 5 },
  plugins: {
    awesome: { options: { singleFile: false } },
  },
});
`;

describe("core/mjs-config", () => {
  it("finds the literal config object in the common export shapes", () => {
    expect(findMjsConfigBrace(config)).not.toBeNull();
    expect(findMjsConfigBrace("module.exports = { name: 'x' }")).not.toBeNull();
    expect(findMjsConfigBrace("export default makeConfig();")).toBeNull();
  });

  it("replaces existing values in place, whatever their shape", () => {
    expect(setMjsOption(config, ["historyPath"], "./h/history.jsonl")).toContain('historyPath: "./h/history.jsonl",');
    expect(setMjsOption(config, ["flakyDetection", "historyDepth"], 10)).toContain("flakyDetection: { historyDepth: 10 }");
    expect(setMjsOption(config, ["flakyDetection"], { historyDepth: 3 })).toContain("flakyDetection: {\"historyDepth\":3},");
  });

  it("inserts missing options, creating nested objects as needed", () => {
    expect(setMjsOption(config, ["appendHistory"], false)).toContain("\n  appendHistory: false,");

    const created = setMjsOption(config.replace("  flakyDetection: { historyDepth: 5 },\n", ""), ["flakyDetection", "historyDepth"], 7);

    expect(created).toContain("flakyDetection: { historyDepth: 7 },");
  });

  it("backs off when a parent on the path isn't an object literal", () => {
    expect(setMjsOption(config.replace("{ historyDepth: 5 }", "shared"), ["flakyDetection", "historyDepth"], 1)).toBeNull();
  });

  it("removes an option together with its comma and line", () => {
    const removed = unsetMjsOption(config, ["historyPath"])!;

    expect(removed).not.toContain("historyPath");
    expect(removed).toContain('name: "My Report",\n  flakyDetection');
    expect(unsetMjsOption(config, ["nothing"])).toBe(config);
  });

  it("adds a plugin to an existing plugins block, or creates the block", () => {
    const added = addMjsPlugin(config, "csv", { options: { fileName: "a.csv" } })!;

    expect(added).toContain('"csv": {"options":{"fileName":"a.csv"}},');
    expect(addMjsPlugin(config.replace(/plugins: \{[\s\S]*?\n  \},\n/, ""), "csv", {})).toContain('plugins: { "csv": {} },');
    expect(addMjsPlugin(config, "awesome", {})).toBeNull();
  });

  it("removes a plugin entry", () => {
    const withTwo = addMjsPlugin(config, "csv", { options: {} })!;
    const removed = removeMjsPlugin(withTwo, "awesome")!;

    expect(removed).not.toContain("awesome");
    expect(removed).toContain('"csv"');
    expect(removeMjsPlugin(config, "csv")).toBe(config);
  });

  it("ignores same-named keys in comments and nested blocks", () => {
    const tricky = `export default {\n  // historyPath: "old",\n  plugins: { x: { historyPath: 1 } },\n};\n`;

    expect(setMjsOption(tricky, ["historyPath"], "new")).toContain('\n  historyPath: "new",');
    expect(unsetMjsOption(tricky, ["historyPath"])).toBe(tricky);
  });
});
