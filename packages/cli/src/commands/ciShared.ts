/** Package-manager specific commands shared by the CI scaffolding commands (`gh-pages init`, `gitlab init`). */
export const getInstallCommand = (packageManager: string): string => {
  switch (packageManager) {
    case "npm":
      return "npm ci";
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
    default:
      return "yarn install --immutable --immutable-cache --check-cache";
  }
};

export const getTestCommand = (packageManager: string): string => {
  switch (packageManager) {
    case "npm":
      return "npm test";
    case "pnpm":
      return "pnpm test";
    case "yarn":
    default:
      return "yarn test";
  }
};

const PYTHON_RUN_PREFIX: Record<string, string> = { poetry: "poetry run ", pdm: "pdm run ", pipenv: "pipenv run " };

/** Python CI needs the project's dependencies installed with its own tool; the lockfile-less default is requirements.txt. */
export const getPythonInstallCommand = (packageManager: string): string => {
  switch (packageManager) {
    case "poetry":
      return "pip install poetry && poetry install";
    case "pdm":
      return "pip install pdm && pdm install";
    case "pipenv":
      return "pip install pipenv && pipenv install --dev";
    default:
      return "pip install -r requirements.txt";
  }
};

const PYTHON_TEST_COMMANDS: Record<string, string> = {
  pytest: "pytest --alluredir=allure-results",
  "pytest-bdd": "pytest --alluredir=allure-results",
  behave: "behave -f allure_behave.formatter:AllureFormatter -o allure-results",
  robotframework: "robot --listener allure_robotframework:allure-results .",
};

export const getPythonTestCommand = (packageManager: string, frameworkId: string | undefined): string =>
  `${PYTHON_RUN_PREFIX[packageManager] ?? ""}${PYTHON_TEST_COMMANDS[frameworkId ?? ""] ?? PYTHON_TEST_COMMANDS.pytest}`;
