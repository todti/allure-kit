# Changelog

All notable changes to `allure-kit`. The format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver (up to 0.x minor versions could contain breaking changes; from 1.0 on, breaking changes need a major version).

## Unreleased

### Changed
- The release workflow now also creates the GitHub release for the tag, with the matching CHANGELOG section as its notes.

## 1.1.0 — 2026-10-08

The first release since 0.2.3. The version jumps to 1.1.0: there is a `v1.0.0` git tag from July that was never published to npm and does not correspond to a release, so 1.0.0 is skipped to avoid confusion.

### Fixed — configs written by earlier versions of `init` that never worked
If you ran `allure-kit init` before this release, run `allure-kit doctor`: it now reports these.
- **Mocha:** the reporter was written as `allure-mocha/reporter`, which does not exist (Mocha failed with `ERR_MOCHA_INVALID_REPORTER`); it is `allure-mocha`.
- **Jest:** `testEnvironment: "allure-jest/environment"` does not exist; it is `allure-jest/node` (or `/jsdom`).
- **Jasmine:** the reporter helper was created in `<root>/helpers`, but Jasmine resolves `helpers` relative to `spec_dir`, so it was never loaded and no results were written. It is now created under `spec_dir`.
- **Cypress:** an ES `import` was injected into CommonJS `cypress.config.js` files (a `SyntaxError` on Node versions without module-syntax detection); the style now follows the file.
- **CodeceptJS:** the `exports.config = {` form that `codeceptjs init` generates was not recognised.
- **Pytest-BDD:** `allure-pytest` and `allure-pytest-bdd` were both installed; both register `--alluredir`, so pytest crashed at startup. Only the BDD adapter is installed now, and `doctor` flags projects that have both.
- **Robot Framework:** the listener is `allure_robotframework:allure-results` (the documented `ListenerV3` does not exist in allure-robotframework 2.x); fixed in the hint and in generated CI commands.
- **Behave** was reported for Pytest-BDD projects (their `features/*.feature` files look the same), so `init` installed an unneeded `allure-behave`; Behave now counts there only when `behave` is declared.
- Adding the `csv` plugin next to a single HTML report plugin moves the HTML report to `<output>/<plugin>/` and leaves the output root without an `index.html`, so a `gh-pages init` workflow that published `./allure-report` served a 404. `gh-pages init` now publishes the subfolder, `plugin add csv` explains the layout and `doctor` tells where the report went.
- **`config set knownIssuesPath`** wrote a top-level field that Allure rejects ("The provided Allure config contains unsupported fields: knownIssuesPath"), which made every `allure` command fail. The key is gone from `config`, and `doctor` now reports unsupported fields in an existing `allurerc` (use `allure generate --known-issues <file>`).
- `--help` listed neither `gitlab init` nor `config`.

### Added
- **Java:** `init --lang java` adds the `io.qameta.allure` Gradle plugin to `build.gradle(.kts)` and patches `pom.xml` for Maven (BOM, `allure-jupiter`, the AspectJ agent in surefire, `allure.properties`); `doctor` checks both, `ci init` supports Gradle and Maven, `migrate` renames `allure-junit5` to `allure-jupiter`. JUnit 5 and TestNG are detected from build files and version catalogs.
- `doctor` compatibility checks: `allure-playwright` < 3.9.0 with Playwright ≥ 1.60, `allure-vitest` ≥ 3.13 on Vitest < 3 (silently writes no results), `allure-js` adapters out of step with `allure-js-commons`, `qualityGate` with `historyPath` (allure3#895), a missing/invalid `ALLURE_TESTPLAN_PATH`, `allure` older than v3 or `allure-commandline` next to it, a custom plugin `import` pointing to a missing file, `allure-framework/allure-action` workflows without the permissions/token they need, a Playwright `fullName` hint for TestOps users, known adapter limitations.
- `doctor` warns when an adapter writes results to a directory that `allure generate` doesn't read (adapter `resultsDir` vs `allurerc` `resultsDir` / the default `allure-results`).
- `doctor --json` / `--strict`, and `doctor` for Python and Java projects (`--lang`).
- `init --dry-run` (install command, a diff of every file it would change, the `allurerc` it would create), `init` prints the official configuration page of each framework, explains why a config was left untouched, and points at monorepo workspace packages.
- `demo`: writes a minimal passing test for each detected framework (Vitest, Jest, Mocha, Playwright, Jasmine, Cucumber.js, pytest, Pytest-BDD, Behave, Robot Framework, JUnit 5) and prints how to run it; the end-to-end suite builds its tests with it.
- `--json` for `init`, `demo`, `migrate`, `update`, `ci init`, `gh-pages init`, `gitlab init`, `plugin add|remove`: one JSON document with the command's messages instead of colored text (for scripts and AI agents).
- `init --workspaces`: runs `init` in every monorepo workspace package that has a test framework.
- For AI coding agents: `llms.txt`, an agent skill (`skills/allure-kit/SKILL.md`) and a ready-to-paste `AGENTS.md` block (README, "Use with AI coding agents").
- `migrate`: JS/TS from Allure 2 (`allure-commandline`, `allure serve`, `--clean`) and Java (`allure-junit5` → `allure-jupiter`).
- `ci init <circleci|jenkins|azure|bitbucket>`; `gitlab init` (JS/TS and Python); `gh-pages init` supports Python.
- `config get|set|list|unset` (`name`, `output`, `resultsDir`, `historyPath`, `appendHistory`, `historyLimit`, `historyBaseUrl`, `environment`, `port`, `flakyDetection.*`, and structured `qualityGate`, `categories`, `variables`, `defaultLabels`, `hideLabels`, `allowedEnvironments`, `globalAttachments` as JSON); `config set/unset` and `plugin add/remove` now edit a literal-object `allurerc.mjs` in place.
- `update --dry-run` and an `installed → latest` preview that flags major upgrades and skips packages that are already current.
- A nightly end-to-end run (`npm run e2e`, `.github/workflows/e2e.yml`) that installs real frameworks and checks that `allure-results` appear, against pinned and latest versions; and a tag-triggered release workflow with npm provenance (see RELEASING.md).

- `plugin add testops` explains that the plugin only uploads in CI and lists the environment variables it reads (`ALLURE_ENDPOINT`, `ALLURE_TOKEN`, `ALLURE_PROJECT_ID`, `ALLURE_LAUNCH_NAME`); `doctor` notes a configured `testops` plugin that is inactive in the current environment.
- `gh-pages init --pr-comments`: also runs on pull requests and comments the test summary via `allure-framework/allure-action`; PR runs aren't published to Pages and don't write the history cache.

### Changed
- `gh-pages init`: the report is generated and published even when tests fail (the job fails afterwards) and history is cached between runs via `historyPath`.
- Framework config patchers look keys up only among the direct properties of the config object (a lexical scanner instead of a 2000-character regex window) and refuse to insert next to a `...spread`.
- `update` no longer installs packages that are already at the latest version.

## 0.2.3 and earlier
See the git history: Python support and the npm-workspaces split, `doctor` wiring checks, automatic reporter wiring in `init`, bundling of the internal `@todti/allure-kit-*` packages into `allure-kit`.
