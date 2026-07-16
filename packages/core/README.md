# @todti/allure-kit-core

Shared kernel for [`allure-kit`](https://www.npmjs.com/package/allure-kit) — config I/O, process exec, filesystem helpers, the Allure report-plugin registry, and the `EcosystemAdapter` contract that language plugins (like [`@todti/allure-kit-npm`](https://www.npmjs.com/package/@todti/allure-kit-npm) and [`@todti/allure-kit-python`](https://www.npmjs.com/package/@todti/allure-kit-python)) implement. Not meant to be used standalone; installed automatically as a dependency of the `allure-kit` CLI and its ecosystem plugins.

## What's in it

- **`ecosystem.ts`** — `FrameworkDescriptor`, `DetectedFramework`, and `EcosystemAdapter<PackageManager>` types. This is the contract every language plugs into: `detectPackageManager`, `detectFrameworks`, `getInstallCommand`/`getRemoveCommand`, `alwaysInstallPackages`, and optional `afterInstall`/`postInstallHint` hooks.
- **`config-io.ts`** — reads/writes `allurerc` (`json`/`yaml`/`mjs`), including plugin and property updates.
- **`exec.ts`** — runs shell commands and captures stdout/stderr/exit code.
- **`fs-scan.ts`** — `fileExists`, a small glob matcher (`*`, `**`), and a depth-limited directory scanner (skips `node_modules`/`.git`/`dist`/`build`).
- **`registry.ts`** — the Allure *reporting-engine* plugin registry (`@allurereport/plugin-*`) — always npm-based regardless of the test framework's language.
- **`templates/allurerc.ts`** — builds a fresh `allurerc` config from a report name and selected plugin ids.
- **`ui.ts`** — console logging helpers used across all `allure-kit` commands.

## Adding a new ecosystem

Implement `EcosystemAdapter<YourPackageManager>` (from `ecosystem.ts`) in a new package, publish it, add it as a dependency of the `allure-kit` CLI package, and register it in `packages/cli/src/ecosystems.ts`. See [`@todti/allure-kit-python`](https://www.npmjs.com/package/@todti/allure-kit-python)'s `adapter.ts` for a complete example.

See the [`allure-kit` README](https://github.com/todti/allure-kit#readme) for full CLI docs.

## License

[Apache-2.0](https://github.com/todti/allure-kit/blob/master/LICENSE)
