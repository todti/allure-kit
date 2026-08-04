import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { type DetectedFramework, fileExists, matchesGlob, scanDirectoryShallow } from "@todti/allure-kit-core";

import { FRAMEWORK_REGISTRY } from "./registry.js";

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export const readProjectPackageJson = async (cwd: string): Promise<PackageJson | null> => {
  try {
    const packageJsonPath = resolve(cwd, "package.json");
    const content = await readFile(packageJsonPath, "utf-8");

    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
};

export const detectFrameworksByFiles = async (cwd: string): Promise<DetectedFramework[]> => {
  const detected: DetectedFramework[] = [];
  const detectedIds = new Set<string>();

  for (const framework of FRAMEWORK_REGISTRY) {
    if (detectedIds.has(framework.id)) {
      continue;
    }

    for (const pattern of framework.configFilePatterns) {
      if (await fileExists(resolve(cwd, pattern))) {
        detected.push({ framework, source: "config-file", version: "unknown" });
        detectedIds.add(framework.id);
        break;
      }
    }
  }

  if (detectedIds.size < FRAMEWORK_REGISTRY.length) {
    const projectFiles = (await scanDirectoryShallow(cwd, 3)).map((filePath) => filePath.split(sep).join("/"));

    for (const framework of FRAMEWORK_REGISTRY) {
      if (detectedIds.has(framework.id)) {
        continue;
      }

      // WDIO commonly uses Cucumber feature files, but it's not the same as standalone Cucumber.js.
      // If WDIO was detected by config, avoid auto-detecting standalone Cucumber.js just by "*.feature".
      if (detectedIds.has("wdio") && framework.id === "cucumberjs") {
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
  }

  return detected;
};

export const detectFrameworks = async (cwd: string): Promise<DetectedFramework[]> => {
  const packageJson = await readProjectPackageJson(cwd);
  const detectedFromDeps: DetectedFramework[] = [];

  if (packageJson) {
    const allDependencies = {
      dependencies: packageJson.dependencies ?? {},
      devDependencies: packageJson.devDependencies ?? {},
    };

    for (const framework of FRAMEWORK_REGISTRY) {
      for (const [source, deps] of Object.entries(allDependencies)) {
        const detectPackageNames = framework.detectPackageNames ?? [framework.packageName];
        const matchedPackageName = detectPackageNames.find((name) => deps[name]);

        if (matchedPackageName) {
          detectedFromDeps.push({
            framework,
            source: source as "dependencies" | "devDependencies",
            version: deps[matchedPackageName],
          });
          break;
        }
      }
    }
  }

  const depIds = new Set(detectedFromDeps.map((d) => d.framework.id));
  const detectedFromFiles = await detectFrameworksByFiles(cwd);
  const fileOnlyDetections = detectedFromFiles.filter((d) => !depIds.has(d.framework.id));

  return [...detectedFromDeps, ...fileOnlyDetections];
};

export const detectInstalledAllurePackages = async (
  cwd: string,
): Promise<{ name: string; version: string; isDev: boolean }[]> => {
  const packageJson = await readProjectPackageJson(cwd);

  if (!packageJson) {
    return [];
  }

  const allurePackages: { name: string; version: string; isDev: boolean }[] = [];

  const scanDeps = (deps: Record<string, string>, isDev: boolean) => {
    for (const [name, version] of Object.entries(deps)) {
      if (
        name === "allure" ||
        name.startsWith("allure-") ||
        name.startsWith("@allurereport/") ||
        name === "newman-reporter-allure" ||
        name === "@wdio/allure-reporter"
      ) {
        allurePackages.push({ name, version, isDev });
      }
    }
  };

  scanDeps(packageJson.dependencies ?? {}, false);
  scanDeps(packageJson.devDependencies ?? {}, true);

  return allurePackages;
};
