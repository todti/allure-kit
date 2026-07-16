import { appendFile, readFile, writeFile } from "node:fs/promises";
import { dirname, parse as parsePath, resolve } from "node:path";

import { fileExists } from "@todti/allure-kit-core";
import { parse as parseToml } from "smol-toml";

export type PythonPackageManager = "pip" | "poetry" | "pdm" | "pipenv";

interface LockfileMapping {
  filename: string;
  packageManager: PythonPackageManager;
}

const LOCKFILE_MAPPINGS: LockfileMapping[] = [
  { filename: "poetry.lock", packageManager: "poetry" },
  { filename: "pdm.lock", packageManager: "pdm" },
  { filename: "Pipfile.lock", packageManager: "pipenv" },
  { filename: "Pipfile", packageManager: "pipenv" },
];

const findLockfileInDir = async (dir: string): Promise<PythonPackageManager | null> => {
  for (const { filename, packageManager } of LOCKFILE_MAPPINGS) {
    if (await fileExists(resolve(dir, filename))) {
      return packageManager;
    }
  }

  return null;
};

const readPyprojectToolSection = async (dir: string): Promise<PythonPackageManager | null> => {
  try {
    const content = await readFile(resolve(dir, "pyproject.toml"), "utf-8");
    const parsed = parseToml(content) as { tool?: Record<string, unknown> };

    if (parsed.tool?.poetry) {
      return "poetry";
    }

    if (parsed.tool?.pdm) {
      return "pdm";
    }
  } catch {
    // no pyproject.toml or invalid TOML
  }

  return null;
};

const hasRequirementsFile = async (dir: string): Promise<boolean> => {
  return (
    (await fileExists(resolve(dir, "requirements.txt"))) || (await fileExists(resolve(dir, "requirements-dev.txt")))
  );
};

const isRootDir = (dir: string): boolean => {
  const parsed = parsePath(dir);

  return parsed.dir === dir || parsed.root === dir;
};

export const detectPythonPackageManager = async (cwd: string): Promise<PythonPackageManager> => {
  let currentDir = resolve(cwd);

  while (!isRootDir(currentDir)) {
    const fromLockfile = await findLockfileInDir(currentDir);

    if (fromLockfile) {
      return fromLockfile;
    }

    const fromPyproject = await readPyprojectToolSection(currentDir);

    if (fromPyproject) {
      return fromPyproject;
    }

    if (await hasRequirementsFile(currentDir)) {
      return "pip";
    }

    currentDir = dirname(currentDir);
  }

  return "pip";
};

export const getInstallCommand = (
  packageManager: PythonPackageManager,
  packages: string[],
  isDev: boolean = true,
): string => {
  const packageList = packages.join(" ");

  switch (packageManager) {
    case "poetry":
      return `poetry add${isDev ? " --group dev" : ""} ${packageList}`;
    case "pdm":
      return `pdm add${isDev ? " -d" : ""} ${packageList}`;
    case "pipenv":
      return `pipenv install${isDev ? " --dev" : ""} ${packageList}`;
    case "pip":
      return `pip install ${packageList}`;
  }
};

export const getRemoveCommand = (packageManager: PythonPackageManager, packages: string[]): string => {
  const packageList = packages.join(" ");

  switch (packageManager) {
    case "poetry":
      return `poetry remove ${packageList}`;
    case "pdm":
      return `pdm remove ${packageList}`;
    case "pipenv":
      return `pipenv uninstall ${packageList}`;
    case "pip":
      return `pip uninstall -y ${packageList}`;
  }
};

/**
 * `pip install` doesn't persist installed packages to any manifest file,
 * unlike npm/poetry/pdm/pipenv which all update their manifest as a side
 * effect of installing. Append the packages to requirements.txt (creating it
 * if missing) so a plain-pip project keeps its dependency list in sync.
 */
export const appendToRequirementsTxt = async (cwd: string, packages: string[]): Promise<void> => {
  const filePath = resolve(cwd, "requirements.txt");
  let existingContent = "";

  try {
    existingContent = await readFile(filePath, "utf-8");
  } catch {
    // file doesn't exist yet
  }

  const existingNames = new Set(
    existingContent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => line.split(/[=<>~! ]/)[0].toLowerCase()),
  );

  const newPackages = packages.filter((pkg) => !existingNames.has(pkg.toLowerCase()));

  if (newPackages.length === 0) {
    return;
  }

  const needsLeadingNewline = existingContent.length > 0 && !existingContent.endsWith("\n");
  const linesToAppend = `${needsLeadingNewline ? "\n" : ""}${newPackages.join("\n")}\n`;

  if (existingContent.length === 0) {
    await writeFile(filePath, linesToAppend, "utf-8");
  } else {
    await appendFile(filePath, linesToAppend, "utf-8");
  }
};
