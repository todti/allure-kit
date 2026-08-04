# @todti/allure-kit-python

Python ecosystem plugin for [`allure-kit`](https://www.npmjs.com/package/allure-kit) — detects Python test frameworks and integrates with pip/poetry/pdm/pipenv. This package is `private` and never published — it exists only for the monorepo's internal structure; `allure-kit`'s build bundles it directly into `dist/cli.cjs`, so published users never install it separately.

## What it does

- **Framework detection** — reads `requirements.txt`/`requirements-dev.txt`, `pyproject.toml` (PEP 621, Poetry, and PDM dependency tables), and `Pipfile`, plus config/test-file fallbacks (`pytest.ini`, `behave.ini`, `features/**/*.feature`, `**/*.robot`, ...).
- **Package manager detection** — walks up from the given directory looking for `poetry.lock`, `pdm.lock`, `Pipfile(.lock)`, a `[tool.poetry]`/`[tool.pdm]` section in `pyproject.toml`, or `requirements*.txt`, defaulting to plain `pip`.
- **Install/remove command generation** for each manager (`poetry add --group dev`, `pdm add -d`, `pipenv install --dev`, `pip install`).
- **`requirements.txt` sync** — `pip install` doesn't persist installed packages to any manifest on its own, so `appendToRequirementsTxt` adds them for parity with the other managers, which self-persist.

## Supported frameworks

| Framework | Adapter package |
|---|---|
| [Behave](https://behave.readthedocs.io/) | `allure-behave` |
| [pytest](https://pytest.org/) | `allure-pytest` |
| [Pytest-BDD](https://pytest-bdd.readthedocs.io/) | `allure-pytest-bdd` |
| [Robot Framework](https://robotframework.org/) | `allure-robotframework` |

## Exports

```ts
import {
  pythonAdapter,             // EcosystemAdapter implementation, registered by allure-kit's CLI
  PYTHON_FRAMEWORK_REGISTRY,
  detectPythonFrameworks,
  detectPythonPackageManager,
  getInstallCommand,
  getRemoveCommand,
  appendToRequirementsTxt,
} from "@todti/allure-kit-python";
```

Built against the shared `EcosystemAdapter`/`FrameworkDescriptor` contract from `packages/core`.

## Usage

You almost certainly want the CLI, not this package directly:

```bash
npx allure-kit init --lang=python --framework=pytest
```

See the [`allure-kit` README](https://github.com/todti/allure-kit#readme) for full CLI docs.

## License

[Apache-2.0](https://github.com/todti/allure-kit/blob/master/LICENSE)
