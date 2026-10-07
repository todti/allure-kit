# Changelog

All notable changes to `allure-kit`. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver (pre-1.0: minor versions may contain breaking changes).

## Unreleased

### Added
- `doctor` compatibility checks: `allure-playwright` older than 3.9.0 with Playwright ≥ 1.60, `allure-js` adapters out of step with `allure-js-commons`, `qualityGate` together with `historyPath` (allure3#895), `ALLURE_TESTPLAN_PATH` pointing to a missing/invalid file, `allure` older than v3 or `allure-commandline` installed next to it, custom plugin `import` pointing to a missing file, known adapter limitations (retries, test plan, Newman environment/categories).
- `doctor --json` (machine-readable results) and `--strict` (exit code 1 when issues are found).
- `doctor` for Python projects (adapter declared in dependencies) and `--lang`.
- `init --dry-run`: shows the install command, a diff of each framework config it would change and the `allurerc` it would create.
- `init` and `doctor` point at monorepo workspace packages (npm/yarn/pnpm) that have a test framework.
- `init` explains why a framework config was left untouched (`reason`).
- `migrate`: JS/TS projects from Allure 2 (`allure-commandline`, `allure serve`, `--clean`) to Allure 3.
- `ci init <circleci|jenkins|azure|bitbucket>`: pipelines that build the report even when tests fail.
- `gitlab init`, `config get|set|list|unset` (`name`, `output`, `resultsDir`, `historyPath`, `appendHistory`, `historyLimit`, `historyBaseUrl`, `knownIssuesPath`, `environment`, `port`, `flakyDetection.*`).
- `update --dry-run` and an `installed → latest` preview that flags major upgrades and skips packages that are already current.
- `gh-pages init` supports Python projects (`--lang`).
- `doctor` hint for `allure-playwright`'s `useLegacyFullName` when the `testops` plugin is used.

### Changed
- `gh-pages init`: the report is generated and published even when tests fail (the job fails afterwards) and history is cached between runs via `historyPath`.
- Framework config patchers look keys up only among the direct properties of the config object (lexical scanner) instead of a 2000-character regex window: no more matches in nested blocks, comments or strings, no duplicate keys in wide `test` blocks.
- `update` no longer installs packages that are already at the latest version.

### Fixed
- `--help` listed neither `gitlab init` nor `config`.

## 0.2.3 and earlier
See the git history: Python support and the npm-workspaces split, `doctor` wiring checks, automatic reporter wiring in `init`, bundling of the internal `@todti/allure-kit-*` packages into `allure-kit`.
