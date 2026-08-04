import type { FrameworkDescriptor } from "@todti/allure-kit-core";

export const PYTHON_FRAMEWORK_REGISTRY: FrameworkDescriptor[] = [
  {
    id: "behave",
    displayName: "Behave",
    packageName: "behave",
    adapterPackage: "allure-behave",
    setupHint: 'Run behave with "-f allure_behave.formatter:AllureFormatter -o allure-results" (add to behave.ini)',
    configFilePatterns: ["behave.ini", ".behaverc"],
    testFilePatterns: ["features/**/*.feature", "features/steps/**/*.py"],
  },
  {
    id: "pytest",
    displayName: "pytest",
    packageName: "pytest",
    adapterPackage: "allure-pytest",
    setupHint: 'Run pytest with "--alluredir=allure-results" (add to pytest.ini or pyproject.toml)',
    configFilePatterns: ["pytest.ini"],
    testFilePatterns: ["test_*.py", "*_test.py", "tests/**/*.py"],
  },
  {
    id: "pytest-bdd",
    displayName: "Pytest-BDD",
    packageName: "pytest-bdd",
    adapterPackage: "allure-pytest-bdd",
    setupHint:
      'Run pytest with "--alluredir=allure-results" (Pytest-BDD scenarios are collected by pytest, alongside allure-pytest)',
    configFilePatterns: [],
    testFilePatterns: [],
  },
  {
    id: "robotframework",
    displayName: "Robot Framework",
    packageName: "robotframework",
    adapterPackage: "allure-robotframework",
    setupHint: 'Run robot with "--listener allure_robotframework.ListenerV3:allure-results"',
    configFilePatterns: [],
    testFilePatterns: ["**/*.robot", "**/*.resource"],
  },
];
