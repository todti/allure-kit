# Releasing allure-kit

Only `allure-kit` (`packages/cli`) is published; `@todti/allure-kit-*` are private and bundled into it by `npm run build`.

## Versioning

[Semantic Versioning](https://semver.org/). While the major version is 0, a **minor** bump may contain breaking changes (new defaults, renamed flags, changed generated files) and a **patch** bump only fixes bugs and adds backwards-compatible features. From 1.0.0 on, breaking changes need a major bump. Record every user-visible change in `CHANGELOG.md` under *Unreleased* as it lands.

## Publishing

1. Make sure `master` is green (CI and the nightly [e2e](.github/workflows/e2e.yml)).
2. In one commit: set the new `version` in `packages/cli/package.json` and turn the *Unreleased* heading of `CHANGELOG.md` into `## <version> — <date>` (add a fresh *Unreleased* above it).
3. Tag and push: `git tag v<version> && git push origin master v<version>`.

The [release workflow](.github/workflows/release.yml) then checks that the tag equals the package version, runs typecheck, build, unit tests and the e2e script, and publishes with `npm publish --provenance`, which attaches a signed attestation linking the package on npm to that workflow run. Last, it creates the GitHub release for the tag (shown under *Releases* in the repository sidebar), using the `## <version> — <date>` section of `CHANGELOG.md` as the notes; the workflow fails if that section is missing, so date the changelog before tagging. A tag alone is not a release: GitHub lists releases and tags separately.

## One-time setup

- A repository secret `NPM_TOKEN`: an npm *automation* token (or a granular token with publish access to `allure-kit`).
- Do **not** set `publishConfig.provenance` in `package.json`: it makes a local `npm publish` fail, because provenance can only be generated from a supported CI provider.
