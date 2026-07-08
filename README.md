# allure-kit

`allure-kit` is a standalone CLI for bootstrapping and maintaining an [Allure 3](https://allurereport.org/) setup in JavaScript/TypeScript projects.

It helps you:
- detect test frameworks and install matching Allure adapters,
- create and maintain `allurerc` config files,
- manage report plugins,
- diagnose setup issues,
- publish reports to GitHub Pages.

Detected frameworks include Vitest, Playwright, Jest, Mocha, Cypress, Cucumber.js, Jasmine, CodeceptJS, Newman, and WebdriverIO (WDIO).

## Run

Use without global install:

```bash
npx allure-kit --help
```

Run a specific command:

```bash
npx allure-kit init
```

## Quick Start

```bash
# 1) Initialize Allure in your project
npx allure-kit init

# 2) Run tests so they produce allure-results
npm test

# 3) Build report
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
```

## Commands

### `init`

```bash
allure-kit init [--lang js|ts] [--framework <id>] [--format json|yaml|mjs] [--yes] [--cwd <path>]
```

`init` does **not** generate any demo tests — it only configures Allure (installs adapters and writes `allurerc`). Sample tests live in a separate repository.

Flags:
- `--lang` — project language. Currently only `js`/`ts` are accepted (a stub for future language support; any other value fails with a usage error).
- `--framework` — force-pick a single framework by id or package name (`playwright`, `vitest`, `wdio`, ...). Implies non-interactive mode with the default `awesome` plugin.
- `--format` — `json` (default), `yaml`, or `mjs` config format.
- `--yes` — accept defaults without prompts.
- `--cwd` — working directory.

### `update`

```bash
allure-kit update [--yes] [--cwd <path>]
```

### `doctor`

```bash
allure-kit doctor [--cwd <path>]
```

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

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Origin

This package started as the `allure kit` subcommand proposed for the [allure3](https://github.com/allure-framework/allure3) CLI in [allure-framework/allure3#556](https://github.com/allure-framework/allure3/pull/556), extracted here into a self-contained, independently publishable CLI.
