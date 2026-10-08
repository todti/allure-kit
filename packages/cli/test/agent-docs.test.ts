import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file: string) => readFileSync(join(root, file), "utf-8");

/** Every top-level command of the CLI; the agent-facing docs must not forget one when commands are added. */
const COMMANDS = ["init", "doctor", "demo", "update", "migrate", "plugin", "config", "ci init", "gh-pages init", "gitlab init"];

describe("docs for AI agents", () => {
  it("llms.txt follows the llms.txt layout and mentions every command", () => {
    const text = read("llms.txt");

    expect(text.startsWith("# allure-kit\n")).toBe(true);
    expect(text).toMatch(/\n> .+/);
    expect(text).toContain("## Docs");

    for (const command of COMMANDS) {
      expect(text, command).toContain(command);
    }
  });

  it("the skill has valid frontmatter and covers the whole workflow", () => {
    const text = read("skills/allure-kit/SKILL.md");
    const frontmatter = /^---\nname: allure-kit\ndescription: (.+)\n---\n/.exec(text);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter![1].length).toBeLessThan(1024);

    for (const needle of ["doctor --json", "init --yes --dry-run", "demo", "ci init", "migrate", "allure-results"]) {
      expect(text, needle).toContain(needle);
    }
  });
});
