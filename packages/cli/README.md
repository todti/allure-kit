# allure-kit

A standalone CLI that sets up and maintains [Allure Report 3](https://allurereport.org/) in a JavaScript/TypeScript or Python project — the equivalent of `npm init` for Allure.

## Why

[Allure 3](https://github.com/allure-framework/allure3) is a fast, plugin-based reporting engine, but wiring it into a project by hand means a handful of separate steps: figure out which test framework(s) the project uses, install the matching adapter package for each one, hand-write an `allurerc` config, pick and configure report plugins, and — if you want reports published automatically — set up CI and GitHub Pages. It's easy to get one of those steps wrong or out of sync as the project evolves.

`allure-kit` automates all of that:
- detects test frameworks in use and installs the matching Allure adapters,
- generates and maintains `allurerc` config files (`json`, `yaml`, or `mjs`),
- manages report plugins (add/remove/list),
- diagnoses a broken or incomplete setup (`doctor`),
- keeps all installed Allure packages up to date (`update`),
- scaffolds a GitHub Actions workflow that publishes reports to GitHub Pages.

Detected frameworks: Vitest, Playwright, Jest, Mocha, Cypress, Cucumber.js, Jasmine, CodeceptJS, Newman (Postman), and WebdriverIO (WDIO) for JS/TS; Behave, pytest, Pytest-BDD, and Robot Framework for Python.

## How it works

- **Framework detection** reads `package.json` dependencies (or, for Python, `requirements*.txt`/`pyproject.toml`/`Pipfile`) and looks for known test-framework config files (`playwright.config.ts`, `vitest.config.ts`, `wdio.conf.ts`, `pytest.ini`, `behave.ini`, etc.) to figure out which frameworks are actually in play, then maps each one to its Allure adapter package (e.g. `playwright` → `allure-playwright`, `pytest` → `allure-pytest`).
- **Package manager detection** looks at the lockfile — `package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`/`bun.lock(b)` for JS/TS, or `poetry.lock`/`pdm.lock`/`Pipfile.lock`/`requirements.txt` for Python — to install adapters with the right tool and flags. A project is treated as Python when `--lang=python` is passed or no `package.json` is found but a Python manifest is present.
- **Config generation** writes an `allurerc` file (JSON/YAML/ESM) wiring up the selected report plugins, defaulting to the [`awesome`](https://allurereport.org/docs/plugin-awesome/) HTML report plugin.
- **`doctor`** re-runs detection and cross-checks it against what's actually installed and configured, flagging missing adapters, unconfigured plugins, or an unused/stale adapter.
- **`update`** finds every `allure*`/`@allurereport/*` package already in `package.json` and bumps it to latest via the detected package manager.
- **`gh-pages init`** writes a `.github/workflows/allure-gh-pages.yml` that runs your tests, generates the report with `allure generate`, and publishes it to the `gh-pages` branch via [`peaceiris/actions-gh-pages`](https://github.com/peaceiris/actions-gh-pages).

Everything is additive and non-destructive: `init` refuses to run if an `allurerc` already exists, and `gh-pages init` asks before overwriting an existing workflow.

## Run

Use without installing:

```bash
npx allure-kit --help
```

## Quick Start

```bash
# 1) Initialize Allure in your project
npx allure-kit init

# 2) Run tests so they produce allure-results
npm test

# 3) Build the report
npx allure generate
```

If an `allurerc` file already exists, `init` exits early and points you at `allure-kit doctor` / `allure-kit update` — it never overwrites an existing config.

For a fully non-interactive setup:

```bash
npx allure-kit init --yes
```

For a one-shot install of a specific framework:

```bash
npx allure-kit init --lang=js --framework=playwright
npx allure-kit init --lang=python --framework=pytest
```

Allure 3's report generator (`allure generate`) is a Node.js CLI regardless of the test framework's language, so Python projects still need Node.js available to run `npx allure generate` — `init` only installs the Python-side adapter package(s) via the detected Python package manager, it doesn't add a `package.json` to a pure Python project.

## Commands

### `init`

```bash
allure-kit init [--lang js|ts|python] [--framework <id>] [--format json|yaml|mjs] [--yes] [--cwd <path>]
```

Detects test frameworks (by dependencies, config files, and existing tests), installs matching adapters, and creates an `allurerc` config. `init` does **not** generate any demo tests — it only configures Allure. Sample tests live in a separate repository.

Flags:
- `--lang` — project language: `js`/`ts` (treated the same) or `python`/`py`. Without this flag, `init` auto-detects: `package.json` present → JS/TS, otherwise a Python manifest (`pyproject.toml`, `requirements*.txt`, `Pipfile`, `setup.py`/`setup.cfg`) present → Python, otherwise defaults to JS/TS.
- `--framework` — force-pick a single framework by id or package name (`playwright`, `vitest`, `wdio`, `pytest`, `behave`, ...). Implies non-interactive mode with the default `awesome` plugin.
- `--format` — `json` (default), `yaml`, or `mjs` config format.
- `--yes` — accept defaults without prompts.
- `--cwd` — working directory.

### `update`

```bash
allure-kit update [--yes] [--cwd <path>]
```

Finds every installed Allure package (CLI, adapters, plugins) and updates them all to latest via your package manager.

### `doctor`

```bash
allure-kit doctor [--cwd <path>]
```

Checks: package manager detection, `allurerc` presence and validity, adapter packages for each detected framework, the `allure` CLI package, configured plugin packages, and adapters that are installed but no longer match a detected framework.

### `gh-pages init`

Creates a GitHub Actions workflow that generates an Allure report and publishes it to GitHub Pages via the `gh-pages` branch.

```bash
allure-kit gh-pages init [--yes] [--branch <name>] [--config <path>] [--test-command <cmd>] [--cwd <path>]
```

### `plugin list`

```bash
allure-kit plugin list [--cwd <path>]
```

### `plugin add`

```bash
allure-kit plugin add <name> [--skip-options] [--cwd <path>]
```

Prompts for confirmation before overwriting a plugin that is already configured.

### `plugin edit`

```bash
allure-kit plugin edit <name> [--cwd <path>]
```

Updates the options of a plugin that is already configured, pre-filled with its current values.

### `plugin remove`

```bash
allure-kit plugin remove <name> [--uninstall] [--cwd <path>]
```

## Supported frameworks

| Framework | Adapter package |
|---|---|
| [Vitest](https://vitest.dev/) | `allure-vitest` |
| [Playwright](https://playwright.dev/) | `allure-playwright` |
| [Jest](https://jestjs.io/) | `allure-jest` |
| [Mocha](https://mochajs.org/) | `allure-mocha` |
| [Cypress](https://www.cypress.io/) | `allure-cypress` |
| [Cucumber.js](https://github.com/cucumber/cucumber-js) | `allure-cucumberjs` |
| [Jasmine](https://jasmine.github.io/) | `allure-jasmine` |
| [CodeceptJS](https://codecept.io/) | `allure-codeceptjs` |
| [Newman](https://github.com/postmanlabs/newman) (Postman) | `newman-reporter-allure` |
| [WebdriverIO](https://webdriver.io/) (WDIO) | `@wdio/allure-reporter` |

Python:

| Framework | Adapter package |
|---|---|
| [Behave](https://behave.readthedocs.io/) | `allure-behave` |
| [pytest](https://pytest.org/) | `allure-pytest` |
| [Pytest-BDD](https://pytest-bdd.readthedocs.io/) | `allure-pytest-bdd` |
| [Robot Framework](https://robotframework.org/) | `allure-robotframework` |

Python package managers pip, [Poetry](https://python-poetry.org/), [PDM](https://pdm-project.org/), and [Pipenv](https://pipenv.pypa.io/) are auto-detected the same way as the npm-family managers. `pip install` doesn't update any manifest on its own, so when pip is the resolved manager `init` also appends the installed adapter(s) to `requirements.txt`.

`doctor` and `gh-pages init` are JS/TS-only for now — they don't yet verify Python adapter installs or scaffold a Python CI workflow.

## Report plugins

All plugins are official [Allure 3 report plugins](https://allurereport.org/docs/). `awesome` is installed by default.

| Plugin | Package | Description |
|---|---|---|
| `awesome` (default) | `@allurereport/plugin-awesome` | Interactive HTML report |
| `classic` | `@allurereport/plugin-classic` | Classic Allure HTML report |
| `dashboard` | `@allurereport/plugin-dashboard` | Summary dashboard |
| `csv` | `@allurereport/plugin-csv` | CSV export |
| `log` | `@allurereport/plugin-log` | Console log output |
| `slack` | `@allurereport/plugin-slack` | Slack notifications |
| `jira` | `@allurereport/plugin-jira` | Jira integration |
| `testops` | `@allurereport/plugin-testops` | Allure TestOps integration |
| `allure2` | `@allurereport/plugin-allure2` | Allure 2 compatible report format |
| `testplan` | `@allurereport/plugin-testplan` | Generates `testplan.json` for selective test execution |
| `progress` | `@allurereport/plugin-progress` | Shows report generation progress in console |

Manage them any time with `allure-kit plugin add|remove|list`.

## Packages

This repo is an npm workspaces monorepo. The published CLI (`allure-kit`, unscoped, unchanged) depends on three scoped packages that can also be used standalone:

| Package | What it is |
|---|---|
| [`allure-kit`](packages/cli) | The CLI itself — commands, prompts, `bin/allure-kit.js` |
| [`@todti/allure-kit-core`](packages/core) | Shared kernel: config I/O, exec, fs helpers, the report-plugin registry, and the `EcosystemAdapter` contract |
| [`@todti/allure-kit-npm`](packages/npm) | JS/TS framework detection + npm/yarn/pnpm/bun integration |
| [`@todti/allure-kit-python`](packages/python) | Python framework detection + pip/poetry/pdm/pipenv integration |

Adding support for another language (e.g. Java) means implementing one more `EcosystemAdapter` package against `@todti/allure-kit-core` and registering it in `packages/cli/src/ecosystems.ts` — no changes to `init`'s control flow.

## Development

```bash
npm install
npm run build      # builds all packages in dependency order (TS project references)
npm test           # runs every package's tests in one vitest run
npm run typecheck
```

## Origin

`allure-kit` started as the `allure kit` subcommand proposed for the [Allure 3](https://github.com/allure-framework/allure3) CLI in [allure-framework/allure3#556](https://github.com/allure-framework/allure3/pull/556). It's extracted here into a self-contained, independently publishable CLI, decoupled from the `allure3` monorepo release cycle so it can ship and iterate on its own.

For the reporting engine itself, adapters, and plugins, see:
- [allure-framework/allure3](https://github.com/allure-framework/allure3) — the Allure 3 monorepo
- [allurereport.org](https://allurereport.org/) — official docs
- [allure-framework/allure3#556](https://github.com/allure-framework/allure3/pull/556) — the original PR this project was extracted from

## License

[Apache-2.0](LICENSE)
