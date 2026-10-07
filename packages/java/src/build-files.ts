import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { fileExists } from "@todti/allure-kit-core";

export type JavaBuildTool = "gradle" | "maven";

const GRADLE_FILES = ["build.gradle.kts", "build.gradle", "settings.gradle.kts", "settings.gradle"];
/** Everything that can declare a test framework dependency, including a Gradle version catalog. */
const DEPENDENCY_FILES = ["build.gradle.kts", "build.gradle", "pom.xml", "gradle/libs.versions.toml"];

export const detectBuildTool = async (cwd: string): Promise<JavaBuildTool> => {
  for (const file of GRADLE_FILES) {
    if (await fileExists(resolve(cwd, file))) {
      return "gradle";
    }
  }

  return (await fileExists(resolve(cwd, "pom.xml"))) ? "maven" : "gradle";
};

export const readBuildText = async (cwd: string): Promise<string> => {
  const parts: string[] = [];

  for (const file of DEPENDENCY_FILES) {
    try {
      parts.push(await readFile(resolve(cwd, file), "utf-8"));
    } catch {
      // not present
    }
  }

  return parts.join("\n");
};

/** The Gradle build script that should receive the plugin, preferring the Kotlin DSL. */
export const findGradleBuildFile = async (cwd: string): Promise<{ path: string; kotlin: boolean } | null> => {
  for (const [file, kotlin] of [
    ["build.gradle.kts", true],
    ["build.gradle", false],
  ] as const) {
    const path = resolve(cwd, file);

    if (await fileExists(path)) {
      return { path, kotlin };
    }
  }

  return null;
};
