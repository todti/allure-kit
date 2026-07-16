import type { FrameworkDescriptor } from "@todti/allure-kit-core";

export const FRAMEWORK_REGISTRY: FrameworkDescriptor[] = [
  {
    id: "vitest",
    displayName: "Vitest",
    packageName: "vitest",
    adapterPackage: "allure-vitest",
    setupHint: 'Add "allure-vitest/reporter" to reporters and "allure-vitest/setup" to setupFiles in vitest.config.ts',
    configFilePatterns: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts", "vitest.config.mjs"],
    testFilePatterns: ["**/*.test.ts", "**/*.test.js", "**/*.spec.ts", "**/*.spec.js"],
  },
  {
    id: "playwright",
    displayName: "Playwright",
    packageName: "@playwright/test",
    adapterPackage: "allure-playwright",
    setupHint: 'Add ["allure-playwright"] to reporter in playwright.config.ts',
    configFilePatterns: [
      "playwright.config.ts",
      "playwright.config.js",
      "playwright.config.mts",
      "playwright.config.mjs",
    ],
    testFilePatterns: ["**/*.spec.ts", "**/*.spec.js", "**/e2e/**/*.ts"],
  },
  {
    id: "jest",
    displayName: "Jest",
    packageName: "jest",
    adapterPackage: "allure-jest",
    setupHint: 'Set testEnvironment to "allure-jest/environment" in jest.config.js',
    configFilePatterns: ["jest.config.ts", "jest.config.js", "jest.config.mjs", "jest.config.cjs", "jest.config.json"],
    testFilePatterns: ["**/*.test.ts", "**/*.test.js", "**/*.test.tsx", "**/*.test.jsx"],
  },
  {
    id: "mocha",
    displayName: "Mocha",
    packageName: "mocha",
    adapterPackage: "allure-mocha",
    setupHint: 'Add "--reporter allure-mocha/reporter" to your mocha command or .mocharc file',
    configFilePatterns: [
      ".mocharc.yml",
      ".mocharc.yaml",
      ".mocharc.json",
      ".mocharc.js",
      ".mocharc.cjs",
      ".mocharc.mjs",
    ],
    testFilePatterns: ["test/**/*.js", "test/**/*.ts"],
  },
  {
    id: "cypress",
    displayName: "Cypress",
    packageName: "cypress",
    adapterPackage: "allure-cypress",
    setupHint: "Import allure-cypress in cypress/support/e2e.ts and add the plugin to cypress.config.ts",
    configFilePatterns: ["cypress.config.ts", "cypress.config.js", "cypress.config.mts", "cypress.config.mjs"],
    testFilePatterns: ["cypress/e2e/**/*.cy.ts", "cypress/e2e/**/*.cy.js"],
  },
  {
    id: "cucumberjs",
    displayName: "Cucumber.js",
    packageName: "@cucumber/cucumber",
    adapterPackage: "allure-cucumberjs",
    setupHint: 'Add "--format allure-cucumberjs/reporter" to your cucumber-js command',
    configFilePatterns: ["cucumber.js", "cucumber.cjs", "cucumber.mjs", "cucumber.yml", "cucumber.yaml"],
    testFilePatterns: ["**/*.feature"],
  },
  {
    id: "jasmine",
    displayName: "Jasmine",
    packageName: "jasmine",
    adapterPackage: "allure-jasmine",
    setupHint: "Add AllureJasmineReporter to jasmine helpers in your spec/support/jasmine.json",
    configFilePatterns: ["spec/support/jasmine.json"],
    testFilePatterns: ["spec/**/*.spec.js", "spec/**/*.spec.ts"],
  },
  {
    id: "codeceptjs",
    displayName: "CodeceptJS",
    packageName: "codeceptjs",
    adapterPackage: "allure-codeceptjs",
    setupHint: 'Add "allure-codeceptjs" to plugins in codecept.conf.js',
    configFilePatterns: ["codecept.conf.ts", "codecept.conf.js", "codecept.conf.mjs", "codecept.conf.cjs"],
    testFilePatterns: ["**/*_test.js", "**/*_test.ts"],
  },
  {
    id: "newman",
    displayName: "Newman (Postman)",
    packageName: "newman",
    adapterPackage: "newman-reporter-allure",
    setupHint: 'Run newman with "-r allure" flag, e.g. newman run collection.json -r allure',
    configFilePatterns: [],
    testFilePatterns: ["**/*.postman_collection.json"],
  },
  {
    id: "wdio",
    displayName: "WebdriverIO (WDIO)",
    packageName: "webdriverio",
    detectPackageNames: [
      "webdriverio",
      "@wdio/cli",
      "@wdio/local-runner",
      "@wdio/runner",
      "@wdio/cucumber-framework",
      "@wdio/mocha-framework",
      "@wdio/jasmine-framework",
    ],
    adapterPackage: "@wdio/allure-reporter",
    setupHint:
      'Install "@wdio/allure-reporter" and add it to reporters in wdio.conf.ts (works for WDIO+Cucumber too), e.g. reporters: [["allure", { outputDir: "allure-results" }]]',
    configFilePatterns: ["wdio.conf.ts", "wdio.conf.js", "wdio.conf.mts", "wdio.conf.mjs", "wdio.conf.cjs"],
    testFilePatterns: [],
  },
];

export const findFrameworkByPackageName = (packageName: string): FrameworkDescriptor | undefined => {
  return FRAMEWORK_REGISTRY.find((framework) => {
    if (framework.packageName === packageName) {
      return true;
    }

    return framework.detectPackageNames?.includes(packageName) ?? false;
  });
};
