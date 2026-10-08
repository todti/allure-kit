---
name: allure-kit
description: Set up, diagnose or migrate Allure 3 reporting in an existing JavaScript/TypeScript, Python or Java (Gradle/Maven) project with the allure-kit CLI (npx allure-kit). Use when the user wants Allure added to a project, tests run but allure-results is empty or the report is blank, they are moving from Allure 2 (allure-commandline) to Allure 3, or they want Allure reports built in CI (GitHub Pages, GitLab, CircleCI, Jenkins, Azure, Bitbucket).
---

# allure-kit

`allure-kit` is a CLI that does the mechanical part of Allure setup and checks the result. Use it instead of hand-editing framework configs: it knows the correct reporter names and syntax per framework (several look right and do not exist), shows a diff first, and `doctor` finds setups that fail silently. It does **not** build the report; `allure generate` (Node.js) does that.

## Before you start

- Work from the project root, or pass `--cwd <dir>`.
- Pass `--yes` to every configuring command so nothing waits for input; add `--json` for a structured result (`{ command, ok, messages[], error? }`).
- Look at `git status` first and `git diff` afterwards; the commands edit framework configs, `package.json`/build files and `allurerc`.
- Do not claim the setup works until `allure-results/` actually appears after running the tests.

## Steps

1. **Diagnose (read-only):** `npx allure-kit doctor --json`. Errors have a `hint`; fix what it names before configuring anything else. `--strict` makes the exit code non-zero when issues exist.
2. **Configure:** `npx allure-kit init --yes --dry-run` shows what would be installed and the diff of each file; if it is right, run `npx allure-kit init --yes --json`.
   - Java: add `--lang java` (Gradle gets the `io.qameta.allure` plugin; Maven's `pom.xml` is patched from the official guide). Python: `--lang python`.
   - Monorepo: `--workspaces` runs it in every workspace package that has a test framework.
   - If a framework config has a shape it cannot patch, `init` leaves it untouched, prints the reason and the manual `setupHint`; apply that by hand.
3. **Verify:** run the tests with the project's own command (the framework command, e.g. `npx vitest run`, `pytest --alluredir=allure-results`) and check `allure-results/` has `*-result.json` files; then `npx allure generate` and look for `allure-report/index.html` (with the `csv` plugin the report moves to `allure-report/<plugin>/`).
   - If the project has no tests yet, `npx allure-kit demo` writes a minimal passing test for each detected framework.
4. **CI (only if asked):** `npx allure-kit ci init <circleci|jenkins|azure|bitbucket>`, `gh-pages init` (GitHub Pages; `--pr-comments` for pull-request summaries), `gitlab init`. They build and keep the report even when tests fail, then fail the job.
5. **Allure 2 → 3:** `npx allure-kit migrate --dry-run`, then without `--dry-run`. Java projects: `allure-junit5` → `allure-jupiter` (needs Allure Java 3 and Java 17+).
6. **Later:** `update --dry-run` shows installed → latest before changing packages; `doctor` after any version bump.

## Things to know

- Results directory: adapters write `allure-results`; if a framework config sets another directory, `doctor` warns, and `allure generate <dir>` or `allure-kit config set resultsDir <dir>` fixes it.
- `allurerc` accepts only the fields Allure knows; do not add others (every `allure` command then fails). Use `allure-kit config set|unset` for supported options.
- Reports need Node.js even for Python/Java projects (Gradle's plugin brings its own).
- Not verified by the maintainers on real servers: generated CI pipelines, the Gradle plugin and the Maven `pom.xml` patch (they are built from the official docs and tested on file contents). Say so if the user depends on them.
- Docs: https://github.com/todti/allure-kit , official Allure docs: https://allurereport.org/docs/
