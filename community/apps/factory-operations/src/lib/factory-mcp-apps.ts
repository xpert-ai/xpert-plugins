import { defineMcpApp } from "@xpert-ai/plugin-sdk";

export const FACTORY_DASHBOARD_MCP_APP_KEY = "factory_operations_dashboard_app";
export const FACTORY_CASE_SUMMARY_MCP_APP_KEY = "factory_case_summary_app";

export const FACTORY_INSIGHTS_MCP_APPS = Object.freeze([
  defineMcpApp({
    key: FACTORY_DASHBOARD_MCP_APP_KEY,
    entry: "dist/mcp-apps/dashboard/index.html",
    title: "Factory operations dashboard",
    description:
      "Interactive organization-scoped Factory Operations summary and lane health.",
    csp: { connectDomains: [], resourceDomains: [] },
  }),
  defineMcpApp({
    key: FACTORY_CASE_SUMMARY_MCP_APP_KEY,
    entry: "dist/mcp-apps/case-summary/index.html",
    title: "Factory Case summary",
    description:
      "Interactive status, progress, evidence, and recovery summary for one Factory Case.",
    csp: { connectDomains: [], resourceDomains: [] },
  }),
]);
