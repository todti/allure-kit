import { describe, expect, it, vi } from "vitest";

const logMock = vi.fn();

vi.mock("node:console", () => ({ log: (...args: unknown[]) => logMock(...args) }));

const { KitDefaultCommand } = await import("../src/commands/defaultCommand.js");

describe("kit/default command", () => {
  it("should print usage and every registered command", async () => {
    const command = new KitDefaultCommand();
    await command.execute();

    const output = logMock.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(output).toContain("allure-kit");
    expect(output).toContain("Usage:");
    expect(output).toContain("init");
    expect(output).toContain("gh-pages init");
    expect(output).toContain("plugin add");
    expect(output).toContain("plugin edit");
    expect(output).toContain("plugin remove");
    expect(output).toContain("plugin list");
    expect(output).toContain("update");
    expect(output).toContain("doctor");
  });
});
