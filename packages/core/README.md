# @todti/allure-kit-core

Shared kernel for [`allure-kit`](https://www.npmjs.com/package/allure-kit) — config I/O, process exec, filesystem helpers, the Allure report-plugin registry, and the `EcosystemAdapter` contract that language plugins (`@todti/allure-kit-npm` and `@todti/allure-kit-python`, in `packages/npm` and `packages/python`) implement. This package is `private` and never published — it exists only for the monorepo's internal structure; `allure-kit`'s build bundles it directly into `dist/cli.cjs`, so published users never install it separately.

## What's in it

- **`ecosystem.ts`** — `FrameworkDescriptor`, `DetectedFramework`, and `EcosystemAdapter<PackageManager>` types. This is the contract every language plugs into: `detectPackageManager`, `detectFrameworks`, `getInstallCommand`/`getRemoveCommand`, `alwaysInstallPackages`, and optional `afterInstall`/`postInstallHint` hooks.
- **`config-io.ts`** — reads/writes `allurerc` (`json`/`yaml`/`mjs`), including plugin and property updates.
- **`exec.ts`** — runs shell commands and captures stdout/stderr/exit code.
- **`fs-scan.ts`** — `fileExists`, a small glob matcher (`*`, `**`), and a depth-limited directory scanner (skips `node_modules`/`.git`/`dist`/`build`).
- **`registry.ts`** — the Allure *reporting-engine* plugin registry (`@allurereport/plugin-*`) — always npm-based regardless of the test framework's language.
- **`templates/allurerc.ts`** — builds a fresh `allurerc` config from a report name and selected plugin ids.
- **`ui.ts`** — console logging helpers used across all `allure-kit` commands.

## Adding a new ecosystem

Implement `EcosystemAdapter<YourPackageManager>` (from `ecosystem.ts`) in a new `packages/<ecosystem>` workspace package, add it as a devDependency of `packages/cli` (esbuild bundles it in at build time — no publishing needed), and register it in `packages/cli/src/ecosystems.ts`. See `packages/python/src/adapter.ts` for a complete example.

See the [`allure-kit` README](https://github.com/todti/allure-kit#readme) for full CLI docs.

## License

[Apache-2.0](https://github.com/todti/allure-kit/blob/master/LICENSE)
