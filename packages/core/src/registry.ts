export interface PluginOptionDescriptor {
  name: string;
  description: string;
  type: "text" | "boolean" | "select";
  defaultValue?: string | boolean;
  choices?: { title: string; value: string }[];
  envVar?: string;
}

export interface ReportPluginDescriptor {
  id: string;
  packageName: string;
  description: string;
  isDefault: boolean;
  options?: PluginOptionDescriptor[];
  /** Behaviour worth knowing right after adding the plugin (shown by `plugin add`). */
  note?: string;
}

/** Plugins that produce an HTML report. */
export const HTML_REPORT_PLUGIN_IDS = ["awesome", "classic", "dashboard", "allure2"];

/**
 * Where the HTML report ends up inside the output directory when these plugins are enabled ("" = the output root).
 * Checked with allure 3.20.1: a single HTML plugin alone (or with `log`) writes to the root; next to `csv` it moves to
 * `<output>/<plugin>/` and the root gets no index.html; two or more HTML plugins each get a folder plus a root index.html.
 */
export const resolveReportSubdir = (pluginIds: string[]): string => {
  const html = pluginIds.filter((id) => HTML_REPORT_PLUGIN_IDS.includes(id));

  return html.length === 1 && pluginIds.includes("csv") ? html[0] : "";
};

export const REPORT_PLUGIN_REGISTRY: ReportPluginDescriptor[] = [
  {
    id: "awesome",
    packageName: "@allurereport/plugin-awesome",
    description: "Interactive HTML report",
    isDefault: true,
    options: [
      { name: "reportName", description: "Report title", type: "text", defaultValue: "Allure Report" },
      {
        name: "theme",
        description: "Report theme",
        type: "select",
        defaultValue: "auto",
        choices: [
          { title: "Auto (follows system)", value: "auto" },
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
        ],
      },
      { name: "singleFile", description: "Emit single HTML file", type: "boolean", defaultValue: false },
      { name: "reportLanguage", description: "Report language (e.g. en, ru, zh)", type: "text" },
      { name: "logo", description: "Logo URL or path", type: "text" },
      {
        name: "layout",
        description: "Report layout",
        type: "select",
        defaultValue: "base",
        choices: [
          { title: "Base", value: "base" },
          { title: "Split", value: "split" },
        ],
      },
      { name: "appendTitlePath", description: "Append the title path to test names", type: "boolean", defaultValue: false },
    ],
  },
  {
    id: "classic",
    packageName: "@allurereport/plugin-classic",
    description: "Classic Allure HTML report",
    isDefault: false,
    options: [
      { name: "reportName", description: "Report title", type: "text", defaultValue: "Allure Report" },
      {
        name: "theme",
        description: "Report theme",
        type: "select",
        defaultValue: "auto",
        choices: [
          { title: "Auto (follows system)", value: "auto" },
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
        ],
      },
      { name: "singleFile", description: "Emit single HTML file", type: "boolean", defaultValue: false },
      { name: "reportLanguage", description: "Report language (e.g. en, ru, zh)", type: "text" },
      { name: "logo", description: "Logo URL or path", type: "text" },
    ],
  },
  {
    id: "dashboard",
    packageName: "@allurereport/plugin-dashboard",
    description: "Summary dashboard",
    isDefault: false,
    options: [
      { name: "reportName", description: "Report title", type: "text", defaultValue: "Allure Report" },
      {
        name: "theme",
        description: "Report theme",
        type: "select",
        defaultValue: "light",
        choices: [
          { title: "Light", value: "light" },
          { title: "Dark", value: "dark" },
        ],
      },
      { name: "singleFile", description: "Emit single HTML file", type: "boolean", defaultValue: false },
      { name: "reportLanguage", description: "Report language (e.g. en, ru, zh)", type: "text" },
      { name: "logo", description: "Logo URL or path", type: "text" },
    ],
  },
  {
    id: "csv",
    packageName: "@allurereport/plugin-csv",
    description: "CSV export",
    isDefault: false,
    note: "With csv enabled next to a single HTML report plugin, Allure writes the HTML report to <output>/<plugin>/ (e.g. allure-report/awesome/) and the output root gets no index.html — serve or publish that folder.",
    options: [
      { name: "fileName", description: "Output file name", type: "text", defaultValue: "allure-results.csv" },
      { name: "separator", description: "CSV column separator", type: "text", defaultValue: "," },
      { name: "disableHeaders", description: "Disable header row", type: "boolean", defaultValue: false },
    ],
  },
  {
    id: "log",
    packageName: "@allurereport/plugin-log",
    description: "Console log output",
    isDefault: false,
    options: [
      {
        name: "groupBy",
        description: "Group results by",
        type: "select",
        defaultValue: "none",
        choices: [
          { title: "None", value: "none" },
          { title: "Suites", value: "suites" },
          { title: "Features", value: "features" },
          { title: "Packages", value: "packages" },
        ],
      },
      { name: "allSteps", description: "Include all steps in output", type: "boolean", defaultValue: false },
      { name: "withTrace", description: "Include stack traces", type: "boolean", defaultValue: false },
      { name: "qualityGateResults", description: "Print quality gate results (incl. passed)", type: "boolean", defaultValue: false },
    ],
  },
  {
    id: "slack",
    packageName: "@allurereport/plugin-slack",
    description: "Slack notifications",
    isDefault: false,
    options: [
      { name: "channel", description: "Slack channel name", type: "text", envVar: "ALLURE_SLACK_CHANNEL" },
      { name: "token", description: "Slack API token", type: "text", envVar: "ALLURE_SLACK_TOKEN" },
    ],
  },
  {
    id: "jira",
    packageName: "@allurereport/plugin-jira",
    description: "Jira integration",
    isDefault: false,
    options: [
      { name: "webhook", description: "Allure Forge App webhook URL", type: "text", envVar: "ALLURE_JIRA_WEBHOOK" },
      { name: "token", description: "Atlassian API token", type: "text", envVar: "ALLURE_JIRA_TOKEN" },
      { name: "issue", description: "Jira issue key to link report to", type: "text" },
      { name: "uploadReport", description: "Upload report to Jira", type: "boolean", defaultValue: false },
      { name: "uploadResults", description: "Upload test results to Jira", type: "boolean", defaultValue: false },
    ],
  },
  {
    id: "testops",
    packageName: "@allurereport/plugin-testops",
    description: "Allure TestOps integration",
    isDefault: false,
    options: [
      { name: "endpoint", description: "TestOps API endpoint URL", type: "text", envVar: "ALLURE_ENDPOINT" },
      { name: "accessToken", description: "API access token", type: "text", envVar: "ALLURE_TOKEN" },
      { name: "projectId", description: "Project ID in TestOps", type: "text", envVar: "ALLURE_PROJECT_ID" },
      { name: "launchName", description: "Launch name", type: "text", envVar: "ALLURE_LAUNCH_NAME" },
    ],
    note: "The TestOps plugin only uploads in CI (CI=true) or when ALLURE_TESTOPS_ENABLED=true / ALLURE_JOB_RUN_ID is set; locally it stays disabled. Options given in allurerc win over the environment variables.",
  },
  {
    id: "allure2",
    packageName: "@allurereport/plugin-allure2",
    description: "Allure 2 compatible report format",
    isDefault: false,
    options: [
      { name: "reportName", description: "Report title", type: "text", defaultValue: "Allure Report" },
      { name: "singleFile", description: "Emit single HTML file", type: "boolean", defaultValue: false },
      { name: "reportLanguage", description: "Report language (e.g. en, ru, zh)", type: "text" },
    ],
  },
  {
    id: "testplan",
    packageName: "@allurereport/plugin-testplan",
    description: "Generate testplan.json for selective test execution",
    isDefault: false,
    options: [{ name: "fileName", description: "Output file name", type: "text", defaultValue: "testplan.json" }],
  },
  {
    id: "progress",
    packageName: "@allurereport/plugin-progress",
    description: "Show report generation progress in console",
    isDefault: false,
  },
];

export const findReportPluginById = (pluginId: string): ReportPluginDescriptor | undefined => {
  return REPORT_PLUGIN_REGISTRY.find((plugin) => plugin.id === pluginId);
};

export const getDefaultReportPlugins = (): ReportPluginDescriptor[] => {
  return REPORT_PLUGIN_REGISTRY.filter((plugin) => plugin.isDefault);
};
