import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { type DetectedFramework, fileExists } from "@todti/allure-kit-core";
import { parse as parseYaml } from "yaml";

import { detectFrameworks } from "./detect-frameworks.js";

export interface WorkspacePackage {
  /** Path relative to the monorepo root, with forward slashes. */
  dir: string;
  frameworks: DetectedFramework[];
}

const readWorkspacePatterns = async (cwd: string): Promise<string[]> => {
  const patterns: string[] = [];

  try {
    const pkg = JSON.parse(await readFile(resolve(cwd, "package.json"), "utf-8")) as { workspaces?: unknown };
    const workspaces = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : (pkg.workspaces as { packages?: unknown } | undefined)?.packages;

    if (Array.isArray(workspaces)) {
      patterns.push(...workspaces.filter((entry): entry is string => typeof entry === "string"));
    }
  } catch {
    // no package.json / not JSON
  }

  try {
    const pnpm = parseYaml(await readFile(resolve(cwd, "pnpm-workspace.yaml"), "utf-8")) as { packages?: unknown };

    if (Array.isArray(pnpm?.packages)) {
      patterns.push(...pnpm.packages.filter((entry): entry is string => typeof entry === "string"));
    }
  } catch {
    // no pnpm-workspace.yaml
  }

  return patterns;
};

/** Supports the common `dir` and `dir/*` workspace patterns; negations and deeper globs are ignored. */
const expandPattern = async (cwd: string, pattern: string): Promise<string[]> => {
  const clean = pattern.replace(/^\.\//, "").replace(/\/$/, "");

  if (clean.startsWith("!") || clean.includes("**")) {
    return [];
  }

  if (!clean.endsWith("/*")) {
    return clean.includes("*") ? [] : [clean];
  }

  const parent = clean.slice(0, -2);

  try {
    const entries = await readdir(resolve(cwd, parent), { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith("."))
      .map((entry) => `${parent}/${entry.name}`);
  } catch {
    return [];
  }
};

/** Workspace packages (npm/yarn/pnpm) that have a test framework Allure can be wired into. */
export const detectWorkspaceFrameworks = async (cwd: string): Promise<WorkspacePackage[]> => {
  const dirs = new Set<string>();

  for (const pattern of await readWorkspacePatterns(cwd)) {
    for (const dir of await expandPattern(cwd, pattern)) {
      dirs.add(dir);
    }
  }

  const result: WorkspacePackage[] = [];

  for (const dir of [...dirs].sort()) {
    const absolute = resolve(cwd, dir);

    if (!(await fileExists(join(absolute, "package.json")))) {
      continue;
    }

    const frameworks = await detectFrameworks(absolute);

    if (frameworks.length > 0) {
      result.push({ dir: relative(cwd, absolute).split("\\").join("/"), frameworks });
    }
  }

  return result;
};
