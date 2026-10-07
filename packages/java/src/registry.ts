import type { FrameworkDescriptor } from "@todti/allure-kit-core";

export const ALLURE_GRADLE_PLUGIN_ID = "io.qameta.allure";
/** Plugin version from the official Gradle integration guide (https://allurereport.org/docs/integrations-gradle/). */
export const ALLURE_GRADLE_PLUGIN_VERSION = "4.3.0";

const MAVEN_SNIPPET =
  "Maven: import io.qameta.allure:allure-bom, add io.qameta.allure:allure-jupiter (test scope), configure the AspectJ agent in maven-surefire-plugin's argLine and set allure.results.directory in src/test/resources/allure.properties — https://allurereport.org/docs/junit5/";

export const JAVA_FRAMEWORK_REGISTRY: FrameworkDescriptor[] = [
  {
    id: "junit5",
    displayName: "JUnit 5",
    packageName: "org.junit.jupiter",
    detectPackageNames: ["junit-jupiter", "org.junit.jupiter"],
    adapterPackage: ALLURE_GRADLE_PLUGIN_ID,
    setupHint: `Gradle: apply the "${ALLURE_GRADLE_PLUGIN_ID}" plugin (version ${ALLURE_GRADLE_PLUGIN_VERSION}) — it adds the JUnit adapter and AspectJ agent itself, then run ./gradlew test allureReport. ${MAVEN_SNIPPET}`,
    configFilePatterns: ["build.gradle.kts", "build.gradle"],
    testFilePatterns: [],
  },
  {
    id: "testng",
    displayName: "TestNG",
    packageName: "org.testng",
    detectPackageNames: ["org.testng", "testng"],
    adapterPackage: ALLURE_GRADLE_PLUGIN_ID,
    setupHint: `Gradle: apply the "${ALLURE_GRADLE_PLUGIN_ID}" plugin (version ${ALLURE_GRADLE_PLUGIN_VERSION}) — it adds the TestNG adapter itself, then run ./gradlew test allureReport. Maven: use io.qameta.allure:allure-testng with the AspectJ agent (https://allurereport.org/docs/testng/)`,
    configFilePatterns: ["build.gradle.kts", "build.gradle"],
    testFilePatterns: [],
  },
];
