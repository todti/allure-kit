import * as console from "node:console";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd as processCwd } from "node:process";

import { logHint, logInfo, logNewLine, logStep, logSuccess, logWarning } from "@todti/allure-kit-core";
import { Command, Option, UsageError } from "clipanion";
import prompts from "prompts";

import { resolveEcosystem } from "../ecosystems.js";
import { getInstallCommand, getPythonInstallCommand, getPythonTestCommand, getTestCommand } from "./ciShared.js";

interface CiPlan {
  python: boolean;
  java: boolean;
  installCommand: string;
  testCommand: string;
  /** Complete report command, including where it writes. */
  generateCommand: string;
  /** Directory the report ends up in, relative to the repository root. */
  reportDir: string;
}

interface CiProvider {
  file: string;
  description: string;
  build: (plan: CiPlan) => string;
  nextSteps: string[];
}

const groovySingleQuoted = (command: string) => command.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const CIRCLE_IMAGE = { js: "cimg/node:20.11", python: "cimg/python:3.12-node", java: "cimg/openjdk:17.0" };

/** Every provider follows the same shape: install, run tests without aborting, generate the report, keep it as an artifact, then fail if tests failed. */
export const CI_PROVIDERS: Record<string, CiProvider> = {
  circleci: {
    file: ".circleci/config.yml",
    description: "CircleCI",
    nextSteps: ["Open the finished job → Artifacts tab → allure-report/index.html"],
    build: (plan) => `version: 2.1

jobs:
  allure-report:
    docker:
      - image: ${plan.java ? CIRCLE_IMAGE.java : plan.python ? CIRCLE_IMAGE.python : CIRCLE_IMAGE.js}
    steps:
      - checkout
      - run:
          name: Install dependencies
          command: ${plan.installCommand}
      - run:
          name: Run tests (produce allure-results)
          command: ${plan.testCommand} || touch .tests-failed
      - run:
          name: Generate Allure report
          command: ${plan.generateCommand}
          when: always
      - store_artifacts:
          path: ${plan.reportDir}
          destination: allure-report
      - run:
          name: Fail the job if tests failed
          command: test ! -f .tests-failed

workflows:
  allure:
    jobs:
      - allure-report
`,
  },
  jenkins: {
    file: "Jenkinsfile",
    description: "Jenkins (declarative pipeline)",
    nextSteps: [
      "The agent needs Node.js (and Python for Python projects) on PATH — add a tools {} block if you manage Node via the NodeJS plugin",
      "The report is archived as a build artifact: allure-report/index.html",
    ],
    build: (plan) => `pipeline {
  agent any

  stages {
    stage('Install') {
      steps {
        sh '${groovySingleQuoted(plan.installCommand)}'
      }
    }
    stage('Test') {
      steps {
        catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
          sh '${groovySingleQuoted(plan.testCommand)}'
        }
      }
    }
    stage('Allure report') {
      steps {
        sh '${groovySingleQuoted(plan.generateCommand)}'
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: '${plan.reportDir}/**', allowEmptyArchive: true
    }
  }
}
`,
  },
  azure: {
    file: "azure-pipelines.yml",
    description: "Azure Pipelines",
    nextSteps: ["Open the run → Artifacts → allure-report, and download it to view index.html (it needs a web server, e.g. npx allure open)"],
    build: (plan) => `trigger:
  - main

pool:
  vmImage: ubuntu-latest

steps:
${
  plan.python
    ? `  - task: UsePythonVersion@0
    inputs:
      versionSpec: "3.12"
`
    : ""
}${
  plan.java
    ? ""
    : `  - task: NodeTool@0
    inputs:
      versionSpec: "20.x"
`
}  - script: ${plan.installCommand}
    displayName: Install dependencies
  - script: ${plan.testCommand} || echo "##vso[task.setvariable variable=TESTS_FAILED]1"
    displayName: Run tests (produce allure-results)
  - script: ${plan.generateCommand}
    displayName: Generate Allure report
    condition: succeededOrFailed()
  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: ${plan.reportDir}
      artifact: allure-report
    condition: succeededOrFailed()
  - script: exit 1
    displayName: Fail the job if tests failed
    condition: eq(variables['TESTS_FAILED'], '1')
`,
  },
};

export class KitCiInitCommand extends Command {
  static paths = [["ci", "init"]];

  static usage = Command.Usage({
    description: "Scaffold a CI pipeline that builds the Allure report (circleci, jenkins, azure)",
    details: `Creates a pipeline that installs dependencies, runs the tests, builds the report with "allure generate" even when tests fail, keeps it as a build artifact and then fails the job if tests failed. For GitHub use "gh-pages init", for GitLab "gitlab init". Providers: ${Object.keys(CI_PROVIDERS).join(", ")}.`,
    examples: [
      ["ci init circleci", "Create .circleci/config.yml"],
      ["ci init jenkins --test-command 'npm run test:e2e'", "Jenkinsfile with a custom test command"],
    ],
  });

  provider = Option.String({ required: true, name: "provider" });

  yes = Option.Boolean("--yes,-y", false, { description: "Overwrite an existing pipeline file without asking" });

  lang = Option.String("--lang", { description: "Project language: js, ts, or python (default: auto-detect)" });

  testCommand = Option.String("--test-command", {
    description: "Test command to run in CI (default: inferred from the package manager / framework)",
  });

  cwd = Option.String("--cwd", { description: "Working directory (default: current directory)" });

  async execute() {
    const provider = CI_PROVIDERS[this.provider];

    if (!provider) {
      const hint = ["github", "gh-pages"].includes(this.provider)
        ? ' Use "allure-kit gh-pages init" for GitHub.'
        : this.provider === "gitlab"
          ? ' Use "allure-kit gitlab init" for GitLab.'
          : "";

      throw new UsageError(
        `Unknown CI provider ${JSON.stringify(this.provider)}. Supported: ${Object.keys(CI_PROVIDERS).join(", ")}.${hint}`,
      );
    }

    const workingDir = typeof this.cwd === "string" ? this.cwd : processCwd();
    const target = resolve(workingDir, provider.file);

    console.log(`\n  Allure CI Setup (${provider.description})\n`);

    const ecosystem = await resolveEcosystem(workingDir, typeof this.lang === "string" ? this.lang : undefined);
    const packageManager = await ecosystem.detectPackageManager(workingDir);
    const java = ecosystem.id === "java";

    if (java && packageManager !== "gradle") {
      throw new UsageError(
        "CI scaffolding for Java is only available for Gradle projects (the Allure Gradle plugin provides the report task). For Maven, run your tests, then `allure generate` on target/allure-results.",
      );
    }

    const python = ecosystem.id === "pip";
    const testCommand = typeof this.testCommand === "string" ? this.testCommand : undefined;
    const plan: CiPlan = java
      ? {
          python: false,
          java: true,
          installCommand: "chmod +x ./gradlew",
          testCommand: testCommand ?? "./gradlew test",
          generateCommand: "./gradlew allureReport",
          reportDir: "build/reports/allure-report/allureReport",
        }
      : {
          python,
          java: false,
          installCommand: python ? getPythonInstallCommand(packageManager) : getInstallCommand(packageManager),
          testCommand:
            testCommand ??
            (python
              ? getPythonTestCommand(packageManager, (await ecosystem.detectFrameworks(workingDir))[0]?.framework.id)
              : getTestCommand(packageManager)),
          generateCommand: `${python ? "npx --yes allure generate" : "npx allure generate"} --output allure-report`,
          reportDir: "allure-report",
        };

    if (existsSync(target) && this.yes !== true) {
      logWarning(`${provider.file} already exists`);

      const { shouldOverwrite } = await prompts({
        type: "confirm",
        name: "shouldOverwrite",
        message: `Overwrite ${provider.file}?`,
        initial: false,
      });

      if (!shouldOverwrite) {
        logInfo("Setup cancelled.");

        return;
      }
    }

    mkdirSync(dirname(target), { recursive: true });
    await writeFile(target, provider.build(plan), "utf-8");
    logSuccess(`Created ${provider.file}`);
    logNewLine();
    logStep("Next steps:");

    for (const step of provider.nextSteps) {
      logHint(step);
    }

    logHint("Commit and push the file; make sure the test command writes to allure-results");
  }
}
