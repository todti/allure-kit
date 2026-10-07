import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type {
  ConfigPatchOutcome,
  DetectedFramework,
  EcosystemAdapter,
  EcosystemFinding,
  FileWriter,
  FrameworkDescriptor,
} from "@todti/allure-kit-core";

import { detectBuildTool, findGradleBuildFile, type JavaBuildTool, readBuildText } from "./build-files.js";
import { ALLURE_GRADLE_PLUGIN_ID, ALLURE_GRADLE_PLUGIN_VERSION, JAVA_FRAMEWORK_REGISTRY } from "./registry.js";

const FRAMEWORK_MARKERS: Record<string, string[]> = {
  junit5: ["useJUnitPlatform"],
  testng: ["useTestNG"],
};

export const detectJavaFrameworks = async (cwd: string): Promise<DetectedFramework[]> => {
  const text = await readBuildText(cwd);

  return JAVA_FRAMEWORK_REGISTRY.filter((framework) =>
    [...(framework.detectPackageNames ?? [framework.packageName]), ...(FRAMEWORK_MARKERS[framework.id] ?? [])].some(
      (marker) => text.includes(marker),
    ),
  ).map((framework) => ({ framework, source: "dependencies" as const, version: "unknown" }));
};

const gradlePluginLine = (kotlin: boolean) =>
  kotlin
    ? `id("${ALLURE_GRADLE_PLUGIN_ID}") version "${ALLURE_GRADLE_PLUGIN_VERSION}"`
    : `id '${ALLURE_GRADLE_PLUGIN_ID}' version '${ALLURE_GRADLE_PLUGIN_VERSION}'`;

const writeToDisk: FileWriter = async (filePath, content) => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
};

export const patchJavaBuild = async (
  cwd: string,
  _framework: FrameworkDescriptor,
  write: FileWriter = writeToDisk,
): Promise<ConfigPatchOutcome> => {
  if ((await detectBuildTool(cwd)) === "maven") {
    return {
      status: "unrecognized-shape",
      configPath: resolve(cwd, "pom.xml"),
      reason:
        "pom.xml isn't patched automatically — Maven needs a BOM, the adapter dependency, the AspectJ agent in surefire and allure.properties",
    };
  }

  const buildFile = await findGradleBuildFile(cwd);

  if (!buildFile) {
    return { status: "no-config-file" };
  }

  const text = await readFile(buildFile.path, "utf-8");

  if (text.includes(ALLURE_GRADLE_PLUGIN_ID)) {
    return { status: "already-configured", configPath: buildFile.path };
  }

  const pluginsBlock = /(^|\n)[ \t]*plugins[ \t]*\{/.exec(text);

  if (!pluginsBlock) {
    return {
      status: "unrecognized-shape",
      configPath: buildFile.path,
      reason: "no top-level `plugins { }` block to add the Allure plugin to",
    };
  }

  const insertAt = pluginsBlock.index + pluginsBlock[0].length;

  await write(buildFile.path, `${text.slice(0, insertAt)}\n    ${gradlePluginLine(buildFile.kotlin)}${text.slice(insertAt)}`);

  return {
    status: "patched",
    configPath: buildFile.path,
    note: text.includes("mavenCentral()") ? undefined : "Add mavenCentral() to `repositories` — the plugin resolves allure-java adapters from it.",
  };
};

const isAdapterConfigured = async (cwd: string): Promise<boolean> => {
  const text = await readBuildText(cwd);

  return text.includes(ALLURE_GRADLE_PLUGIN_ID) || /allure-(jupiter|junit5|testng)/.test(text);
};

const wrapperGradleVersion = async (cwd: string): Promise<string | null> => {
  try {
    const properties = await readFile(resolve(cwd, "gradle/wrapper/gradle-wrapper.properties"), "utf-8");

    return /gradle-(\d+\.\d+(?:\.\d+)?)-/.exec(properties)?.[1] ?? null;
  } catch {
    return null;
  }
};

const atLeast = (version: string, minimum: [number, number]) => {
  const [major, minor] = version.split(".").map(Number);

  return major > minimum[0] || (major === minimum[0] && minor >= minimum[1]);
};

/** Maven has no autoconfiguring plugin, so each moving part is checked separately (https://allurereport.org/docs/junit5/). */
const diagnoseMaven = async (cwd: string): Promise<EcosystemFinding[]> => {
  let pom: string;

  try {
    pom = await readFile(resolve(cwd, "pom.xml"), "utf-8");
  } catch {
    return [];
  }

  const usesAllure = /io\.qameta\.allure/.test(pom);
  const findings: EcosystemFinding[] = [];

  if (!usesAllure) {
    return [
      {
        level: "info",
        message: "pom.xml doesn't use Allure yet",
        hint: "Add allure-bom, allure-jupiter (test scope), the AspectJ agent in surefire's argLine and allure.properties — https://allurereport.org/docs/junit5/",
      },
    ];
  }

  if (/<artifactId>allure-junit5(-assert)?<\/artifactId>/.test(pom)) {
    findings.push({
      level: "warning",
      message: "allure-junit5 is not published by Allure Java 3.0 and later",
      hint: "Switch to io.qameta.allure:allure-jupiter (and allure-jupiter-assert) — works with JUnit 5 and 6, needs Java 17+",
    });
  }

  if (!/aspectjweaver/.test(pom) || !/-javaagent/.test(pom)) {
    findings.push({
      level: "error",
      message: "The AspectJ agent isn't configured for surefire, so @Step and @Attachment won't be recorded",
      hint: 'Add org.aspectj:aspectjweaver and set maven-surefire-plugin\'s argLine to -javaagent:"${settings.localRepository}/org/aspectj/aspectjweaver/${aspectj.version}/aspectjweaver-${aspectj.version}.jar"',
    });
  }

  let properties = "";

  try {
    properties = await readFile(resolve(cwd, "src/test/resources/allure.properties"), "utf-8");
  } catch {
    // reported below
  }

  if (!/allure\.results\.directory\s*=/.test(properties)) {
    findings.push({
      level: "warning",
      message: "src/test/resources/allure.properties doesn't set allure.results.directory",
      hint: "Add allure.results.directory=target/allure-results so results land where `allure generate` is pointed",
    });
  }

  return findings;
};

const diagnose = async (cwd: string): Promise<EcosystemFinding[]> => {
  if ((await detectBuildTool(cwd)) === "maven") {
    return diagnoseMaven(cwd);
  }

  const findings: EcosystemFinding[] = [];
  const gradleVersion = await wrapperGradleVersion(cwd);
  const text = await readBuildText(cwd);

  if (gradleVersion && text.includes(ALLURE_GRADLE_PLUGIN_ID) && !atLeast(gradleVersion, [8, 11])) {
    findings.push({
      level: "error",
      message: `Gradle ${gradleVersion} is too old for the Allure Gradle plugin (needs Gradle 8.11 or newer)`,
      hint: "Run: ./gradlew wrapper --gradle-version 8.11",
    });
  }

  if (/autoconfigure(\.set\(\s*false\s*\)|\s*=\s*false)/.test(text)) {
    findings.push({
      level: "warning",
      message: "allure { adapter { autoconfigure } } is disabled — the allure-java adapter and AspectJ agent are not added automatically",
      hint: "Add the adapter dependency and agent yourself, or remove the autoconfigure=false setting",
    });
  }

  return findings;
};

export const javaAdapter: EcosystemAdapter<JavaBuildTool> = {
  id: "java",
  displayName: "Java",
  langAliases: ["java", "gradle", "maven"],
  frameworkRegistry: JAVA_FRAMEWORK_REGISTRY,
  manifestFiles: ["build.gradle.kts", "build.gradle", "pom.xml"],
  detectPackageManager: detectBuildTool,
  detectFrameworks: detectJavaFrameworks,
  // Nothing is installed by a shell command: Gradle resolves the plugin and adapters on the next build.
  getInstallCommand: () => "",
  getRemoveCommand: () => "",
  alwaysInstallPackages: [],
  setupViaBuildFile: true,
  postInstallHint:
    "Run ./gradlew test allureReport — the report lands in build/reports/allure-report/allureReport/. The Gradle plugin brings its own Node.js, so none has to be installed.",
  patchFrameworkConfig: patchJavaBuild,
  isAdapterConfigured: (cwd) => isAdapterConfigured(cwd),
  diagnose,
};

