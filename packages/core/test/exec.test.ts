import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { executeCommand } from "../src/exec.js";

describe("kit/exec", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "allure-kit-exec-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should capture stdout and a zero exit code on success", async () => {
    const result = await executeCommand('echo "hello world"', tempDir);

    expect(result.stdout.trim()).toBe("hello world");
    expect(result.exitCode).toBe(0);
  });

  it("should capture stderr", async () => {
    const result = await executeCommand('echo "oops" 1>&2', tempDir);

    expect(result.stderr.trim()).toBe("oops");
  });

  it("should report a non-zero exit code on failure", async () => {
    const result = await executeCommand("exit 1", tempDir);

    expect(result.exitCode).toBe(1);
  });

  it("should run the command in the given cwd", async () => {
    const result = await executeCommand("pwd", tempDir);

    // resolve both sides through the OS temp dir's real path (macOS symlinks /tmp -> /private/tmp)
    expect(result.stdout.trim().endsWith(tempDir.split("/").pop()!)).toBe(true);
  });
});
