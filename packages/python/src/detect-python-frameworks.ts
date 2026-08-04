import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { type DetectedFramework, fileExists, matchesGlob, scanDirectoryShallow } from "@todti/allure-kit-core";
import { parse as parseToml } from "smol-toml";

import { PYTHON_FRAMEWORK_REGISTRY } from "./registry.js";

export interface PythonDependency {
  name: string;
  version: string;
  isDev: boolean;
}

const PEP508_NAME_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)/;

const parsePep508Name = (spec: string): { name: string; version: string } => {
  const trimmed = spec.trim();
  const match = PEP508_NAME_RE.exec(trimmed);
  const name = match ? match[1] : trimmed;
  const rest = trimmed.slice(name.length).trim();

  return { name, version: rest.length > 0 ? rest : "unknown" };
};

const parseRequirementsLine = (line: string): { name: string; version: string } | null => {
  const trimmed = line.trim();

  if (trimmed.length === 0 || trimmed.startsWith("#") || trimmed.startsWith("-")) {
    return null;
  }

  return parsePep508Name(trimmed);
};

export const readRequirementsTxt = async (cwd: string): Promise<PythonDependency[]> => {
  const deps: PythonDependency[] = [];
  const files: { filename: string; isDev: boolean }[] = [
    { filename: "requirements.txt", isDev: false },
    { filename: "requirements-dev.txt", isDev: true },
    { filename: "requirements_dev.txt", isDev: true },
    { filename: "dev-requirements.txt", isDev: true },
  ];

  for (const { filename, isDev } of files) {
    try {
      const content = await readFile(resolve(cwd, filename), "utf-8");

      for (const line of content.split("\n")) {
        const parsed = parseRequirementsLine(line);

        if (parsed) {
          deps.push({ ...parsed, isDev });
        }
      }
    } catch {
      // file doesn't exist
    }
  }

  return deps;
};

type TomlTable = Record<string, unknown>;

const isTable = (value: unknown): value is TomlTable => typeof value === "object" && value !== null;

const namesFromDependencyTable = (table: unknown, isDev: boolean): PythonDependency[] => {
  if (!isTable(table)) {
    return [];
  }

  const deps: PythonDependency[] = [];

  for (const [name, value] of Object.entries(table)) {
    if (name.toLowerCase() === "python") {
      continue;
    }

    let version = "unknown";

    if (typeof value === "string") {
      version = value;
    } else if (isTable(value) && typeof value.version === "string") {
      version = value.version;
    }

    deps.push({ name, version, isDev });
  }

  return deps;
};

const namesFromPep508List = (list: unknown, isDev: boolean): PythonDependency[] => {
  if (!Array.isArray(list)) {
    return [];
  }

  return list.filter((item): item is string => typeof item === "string").map((spec) => ({ ...parsePep508Name(spec), isDev }));
};

export const readPyprojectToml = async (cwd: string): Promise<PythonDependency[]> => {
  let parsed: TomlTable;

  try {
    const content = await readFile(resolve(cwd, "pyproject.toml"), "utf-8");

    parsed = parseToml(content) as TomlTable;
  } catch {
    return [];
  }

  const deps: PythonDependency[] = [];

  const project = isTable(parsed.project) ? parsed.project : undefined;

  if (project) {
    deps.push(...namesFromPep508List(project.dependencies, false));

    const optional = project["optional-dependencies"];

    if (isTable(optional)) {
      for (const group of Object.values(optional)) {
        deps.push(...namesFromPep508List(group, true));
      }
    }
  }

  const tool = isTable(parsed.tool) ? parsed.tool : undefined;
  const poetry = tool && isTable(tool.poetry) ? tool.poetry : undefined;

  if (poetry) {
    deps.push(...namesFromDependencyTable(poetry.dependencies, false));

    const group = poetry.group;

    if (isTable(group)) {
      for (const groupTable of Object.values(group)) {
        if (isTable(groupTable)) {
          deps.push(...namesFromDependencyTable(groupTable.dependencies, true));
        }
      }
    }
  }

  const pdm = tool && isTable(tool.pdm) ? tool.pdm : undefined;

  if (pdm) {
    const devDeps = pdm["dev-dependencies"];

    if (isTable(devDeps)) {
      for (const list of Object.values(devDeps)) {
        deps.push(...namesFromPep508List(list, true));
      }
    }
  }

  return deps;
};

export const readPipfile = async (cwd: string): Promise<PythonDependency[]> => {
  let parsed: TomlTable;

  try {
    const content = await readFile(resolve(cwd, "Pipfile"), "utf-8");

    parsed = parseToml(content) as TomlTable;
  } catch {
    return [];
  }

  return [
    ...namesFromDependencyTable(parsed.packages, false),
    ...namesFromDependencyTable(parsed["dev-packages"], true),
  ];
};

export const readProjectPythonDependencies = async (cwd: string): Promise<PythonDependency[]> => {
  const [requirements, pyproject, pipfile] = await Promise.all([
    readRequirementsTxt(cwd),
    readPyprojectToml(cwd),
    readPipfile(cwd),
  ]);

  return [...requirements, ...pyproject, ...pipfile];
};

export const detectPythonFrameworksByFiles = async (cwd: string): Promise<DetectedFramework[]> => {
  const detected: DetectedFramework[] = [];
  const detectedIds = new Set<string>();

  for (const framework of PYTHON_FRAMEWORK_REGISTRY) {
    for (const pattern of framework.configFilePatterns) {
      if (await fileExists(resolve(cwd, pattern))) {
        detected.push({ framework, source: "config-file", version: "unknown" });
        detectedIds.add(framework.id);
        break;
      }
    }
  }

  const projectFiles = (await scanDirectoryShallow(cwd, 3)).map((filePath) => filePath.split(sep).join("/"));

  for (const framework of PYTHON_FRAMEWORK_REGISTRY) {
    if (detectedIds.has(framework.id)) {
      continue;
    }

    const hasTestFiles = framework.testFilePatterns.some((pattern) =>
      projectFiles.some((file) => matchesGlob(file, pattern)),
    );

    if (hasTestFiles) {
      detected.push({ framework, source: "test-files", version: "unknown" });
      detectedIds.add(framework.id);
    }
  }

  return detected;
};

export const detectPythonFrameworks = async (cwd: string): Promise<DetectedFramework[]> => {
  const dependencies = await readProjectPythonDependencies(cwd);
  const depsByName = new Map(dependencies.map((dep) => [dep.name.toLowerCase(), dep]));

  const detectedFromDeps: DetectedFramework[] = [];

  for (const framework of PYTHON_FRAMEWORK_REGISTRY) {
    const dep = depsByName.get(framework.packageName.toLowerCase());

    if (dep) {
      detectedFromDeps.push({
        framework,
        source: dep.isDev ? "devDependencies" : "dependencies",
        version: dep.version,
      });
    }
  }

  const depIds = new Set(detectedFromDeps.map((d) => d.framework.id));
  const detectedFromFiles = await detectPythonFrameworksByFiles(cwd);
  const fileOnlyDetections = detectedFromFiles.filter((d) => !depIds.has(d.framework.id));

  return [...detectedFromDeps, ...fileOnlyDetections];
};
