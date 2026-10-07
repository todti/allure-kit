import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { FileWriter } from "@todti/allure-kit-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectBuildTool, detectJavaFrameworks, javaAdapter, JAVA_FRAMEWORK_REGISTRY } from "../src/index.js";

describe("java/adapter", () => {
  let dir: string;

  const put = async (file: string, content: string) => {
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await writeFile(join(dir, file), content);
  };

  const patch = async (id = "junit5") => {
    const writes: Record<string, string> = {};
    const write: FileWriter = async (path, content) => void (writes[path] = content);
    const framework = JAVA_FRAMEWORK_REGISTRY.find((f) => f.id === id)!;
    const outcome = await javaAdapter.patchFrameworkConfig!(dir, framework, write);

    return { outcome, writes };
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-java-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("detects the build tool and test frameworks", async () => {
    await put("build.gradle.kts", 'dependencies { testImplementation("org.junit.jupiter:junit-jupiter:5.10.0") }\ntests { useJUnitPlatform() }');

    expect(await detectBuildTool(dir)).toBe("gradle");
    expect((await detectJavaFrameworks(dir)).map((d) => d.framework.id)).toEqual(["junit5"]);

    await rm(join(dir, "build.gradle.kts"));
    await put("pom.xml", "<dependency><groupId>org.testng</groupId><artifactId>testng</artifactId></dependency>");

    expect(await detectBuildTool(dir)).toBe("maven");
    expect((await detectJavaFrameworks(dir)).map((d) => d.framework.id)).toEqual(["testng"]);
  });

  it("also reads a Gradle version catalog", async () => {
    await put("build.gradle.kts", "plugins { java }");
    await put("gradle/libs.versions.toml", 'junit = { module = "org.junit.jupiter:junit-jupiter", version = "5.10.0" }');

    expect((await detectJavaFrameworks(dir)).map((d) => d.framework.id)).toEqual(["junit5"]);
  });

  it("adds the Allure plugin to a Kotlin DSL plugins block", async () => {
    await put("build.gradle.kts", 'plugins {\n    java\n}\n\nrepositories {\n    mavenCentral()\n}\n');

    const { outcome, writes } = await patch();

    expect(outcome.status).toBe("patched");
    expect(outcome.note).toBeUndefined();
    expect(Object.values(writes)[0]).toContain('plugins {\n    id("io.qameta.allure") version "4.3.0"\n    java');
  });

  it("uses Groovy syntax for build.gradle and warns when mavenCentral() is missing", async () => {
    await put("build.gradle", "plugins {\n    id 'java'\n}\n");

    const { outcome, writes } = await patch();

    expect(Object.values(writes)[0]).toContain("id 'io.qameta.allure' version '4.3.0'");
    expect(outcome.note).toContain("mavenCentral()");
  });

  it("is idempotent and backs off without a plugins block", async () => {
    await put("build.gradle.kts", 'plugins { id("io.qameta.allure") version "4.3.0" }');
    expect((await patch()).outcome.status).toBe("already-configured");

    await put("build.gradle.kts", "apply(plugin = \"java\")\n");

    const { outcome, writes } = await patch();

    expect(outcome.status).toBe("unrecognized-shape");
    expect(outcome.reason).toContain("plugins");
    expect(writes).toEqual({});
  });

  it("does not patch pom.xml but explains why", async () => {
    await put("pom.xml", "<project/>");

    const { outcome } = await patch();

    expect(outcome.status).toBe("unrecognized-shape");
    expect(outcome.reason).toContain("pom.xml");
  });

  it("diagnoses an old Gradle wrapper and disabled autoconfiguration", async () => {
    await put("build.gradle.kts", 'plugins { id("io.qameta.allure") version "4.3.0" }\nallure { adapter { autoconfigure.set(false) } }');
    await put("gradle/wrapper/gradle-wrapper.properties", "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.5-bin.zip");

    const findings = await javaAdapter.diagnose!(dir);

    expect(findings.map((f) => f.level)).toEqual(["error", "warning"]);
    expect(findings[0].message).toContain("Gradle 8.5");
  });

  it("is happy with a modern wrapper", async () => {
    await put("build.gradle.kts", 'plugins { id("io.qameta.allure") version "4.3.0" }');
    await put("gradle/wrapper/gradle-wrapper.properties", "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14-bin.zip");

    expect(await javaAdapter.diagnose!(dir)).toEqual([]);
    expect(await readFile(join(dir, "build.gradle.kts"), "utf-8")).toContain("io.qameta.allure");
  });
});
