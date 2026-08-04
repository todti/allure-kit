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
}

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
      { name: "endpoint", description: "TestOps API endpoint URL", type: "text" },
      { name: "accessToken", description: "API access token", type: "text" },
      { name: "projectId", description: "Project ID in TestOps", type: "text" },
      { name: "launchName", description: "Launch name", type: "text" },
    ],
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
