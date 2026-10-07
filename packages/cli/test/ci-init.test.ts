import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { UsageError } from "clipanion";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { CI_PROVIDERS, KitCiInitCommand } from "../src/commands/ciInit.js";

describe("kit/ci-init", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "allure-kit-ci-init-"));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  const run = async (provider: string, setUp?: () => Promise<void>) => {
    await setUp?.();

    const command = new KitCiInitCommand();

    command.provider = provider;
    command.cwd = dir;
    command.yes = true;

    await command.execute();

    return readFile(join(dir, CI_PROVIDERS[provider].file), "utf-8");
  };

  const pythonProject = () => writeFile(join(dir, "requirements.txt"), "pytest\nallure-pytest\n");

  it("creates a CircleCI config that still builds the report when tests fail", async () => {
    const config = parseYaml(await run("circleci"));
    const steps = config.jobs["allure-report"].steps;

    expect(config.jobs["allure-report"].docker[0].image).toBe("cimg/node:20.11");
    expect(JSON.stringify(steps)).toContain("npm test || touch .tests-failed");
    expect(JSON.stringify(steps)).toContain("npx allure generate --output allure-report");
    expect(steps.at(-1).run.command).toBe("test ! -f .tests-failed");
  });

  it("uses a Python+Node image and the framework command for Python projects", async () => {
    const config = parseYaml(await run("circleci", pythonProject));

    expect(config.jobs["allure-report"].docker[0].image).toBe("cimg/python:3.12-node");
    expect(JSON.stringify(config)).toContain("pip install -r requirements.txt");
    expect(JSON.stringify(config)).toContain("pytest --alluredir=allure-results || touch .tests-failed");
    expect(JSON.stringify(config)).toContain("npx --yes allure generate --output allure-report");
  });

  it("creates an Azure pipeline that publishes the artifact and fails at the end", async () => {
    const pipeline = parseYaml(await run("azure"));
    const text = JSON.stringify(pipeline);

    expect(text).toContain("PublishPipelineArtifact@1");
    expect(text).toContain("##vso[task.setvariable variable=TESTS_FAILED]1");
    expect(pipeline.steps.at(-1).condition).toBe("eq(variables['TESTS_FAILED'], '1')");
  });

  it("adds UsePythonVersion to the Azure pipeline for Python projects", async () => {
    expect(await run("azure", pythonProject)).toContain("UsePythonVersion@0");
  });

  it("creates a Jenkinsfile that keeps going after failing tests and archives the report", async () => {
    const jenkinsfile = await run("jenkins");

    expect(jenkinsfile).toContain("catchError(buildResult: 'FAILURE', stageResult: 'FAILURE')");
    expect(jenkinsfile).toContain("sh 'npx allure generate --output allure-report'");
    expect(jenkinsfile).toContain("archiveArtifacts artifacts: 'allure-report/**'");
  });

  it("escapes single quotes in a custom test command for Groovy", async () => {
    const command = new KitCiInitCommand();

    command.provider = "jenkins";
    command.cwd = dir;
    command.yes = true;
    command.testCommand = "npm test -- --grep 'a b'";
    await command.execute();

    expect(await readFile(join(dir, "Jenkinsfile"), "utf-8")).toContain("sh 'npm test -- --grep \\'a b\\''");
  });

  it("rejects unknown providers and points GitHub/GitLab users to their commands", async () => {
    const command = new KitCiInitCommand();

    command.provider = "gitlab";

    await expect(command.execute()).rejects.toThrow(UsageError);
    await expect(command.execute()).rejects.toThrow(/gitlab init/);
  });

  describe("java (Gradle)", () => {
    const gradleProject = () =>
      writeFile(join(dir, "build.gradle.kts"), 'plugins { id("io.qameta.allure") version "4.3.0" }\ntests { useJUnitPlatform() }\n');

    it("uses a JDK image, the Gradle report task and its output directory", async () => {
      const config = parseYaml(await run("circleci", gradleProject));
      const text = JSON.stringify(config);

      expect(config.jobs["allure-report"].docker[0].image).toBe("cimg/openjdk:17.0");
      expect(text).toContain("chmod +x ./gradlew");
      expect(text).toContain("./gradlew test || touch .tests-failed");
      expect(text).toContain("./gradlew allureReport");
      expect(text).toContain("build/reports/allure-report/allureReport");
      expect(text).not.toContain("npx");
    });

    it("skips Node setup in the Azure pipeline and archives the Gradle report in Jenkins", async () => {
      expect(await run("azure", gradleProject)).not.toContain("NodeTool@0");
      expect(await run("jenkins")).toContain("archiveArtifacts artifacts: 'build/reports/allure-report/allureReport/**'");
    });

    it("builds the Maven report with the Node-based CLI from target/allure-results", async () => {
      const mavenProject = () => writeFile(join(dir, "pom.xml"), "<project/>");
      const config = parseYaml(await run("circleci", mavenProject));
      const text = JSON.stringify(config);

      expect(config.jobs["allure-report"].docker[0].image).toBe("cimg/openjdk:17.0-node");
      expect(text).toContain("mvn -B test || touch .tests-failed");
      expect(text).toContain("npx --yes allure generate target/allure-results --output allure-report");
      expect(await run("azure")).toContain("NodeTool@0");
    });
  });
});
