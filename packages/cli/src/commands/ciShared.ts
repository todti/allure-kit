/** Package-manager specific commands shared by the CI scaffolding commands (`gh-pages init`, `gitlab init`). */
export const getInstallCommand = (packageManager: string): string => {
  switch (packageManager) {
    case "npm":
      return "npm ci";
    case "pnpm":
      return "pnpm install --frozen-lockfile";
    case "yarn":
    default:
      return "yarn install --immutable --immutable-cache --check-cache";
  }
};

export const getTestCommand = (packageManager: string): string => {
  switch (packageManager) {
    case "npm":
      return "npm test";
    case "pnpm":
      return "pnpm test";
    case "yarn":
    default:
      return "yarn test";
  }
};
