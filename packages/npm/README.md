# @todti/allure-kit-npm

JS/TS ecosystem plugin for [`allure-kit`](https://www.npmjs.com/package/allure-kit) — detects JS/TS test frameworks and integrates with npm/yarn/pnpm/bun. Not meant to be used standalone; installed automatically as a dependency of the `allure-kit` CLI.

## What it does

- **Framework detection** — reads `package.json` dependencies/devDependencies plus config-file (`playwright.config.ts`, `vitest.config.ts`, `wdio.conf.ts`, ...) and test-file glob fallbacks.
- **Package manager detection** — reads the `packageManager` field in `package.json` (Corepack-style), then known lockfiles (`bun.lock(b)`, `yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`), walking up parent directories for monorepos. Defaults to `npm`.
- **Install/remove command generation** for each manager, with the right dev-dependency flag.

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

## Exports

```ts
import {
  npmAdapter,             // EcosystemAdapter implementation, registered by allure-kit's CLI
  FRAMEWORK_REGISTRY,
  findFrameworkByPackageName,
  detectFrameworks,
  detectFrameworksByFiles,
  detectInstalledAllurePackages,
  detectPackageManager,
  getInstallCommand,
  getRemoveCommand,
} from "@todti/allure-kit-npm";
```

Built against the shared `EcosystemAdapter`/`FrameworkDescriptor` contract from [`@todti/allure-kit-core`](https://www.npmjs.com/package/@todti/allure-kit-core).

## Usage

You almost certainly want the CLI, not this package directly:

```bash
npx allure-kit init --lang=js --framework=playwright
```

See the [`allure-kit` README](https://github.com/todti/allure-kit#readme) for full CLI docs.

## License

[Apache-2.0](https://github.com/todti/allure-kit/blob/master/LICENSE)
