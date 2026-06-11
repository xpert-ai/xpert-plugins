# @xpert-ai/community-browser-lab

XpertAI Browser Lab is an Xpert plugin for browser research workflows. It includes:

- A runnable Xpert built-in toolset for browser research planning and page evidence extraction.
- A Codex-style `.xpertai-plugin/plugin.json` bundle manifest.
- Plugin-scoped skill, MCP server descriptor, app/connector descriptor, lifecycle hooks, and assets.

## Resource demo

This package is the validation plugin for Xpert plugin resources. Xpert reads these Codex-style bundle resources from the installed plugin bundle when the resources UI or installer needs them:

| Resource | Component key | Source | Expected Xpert runtime |
| --- | --- | --- | --- |
| Skill | `browser-research` | `skills/browser-research/SKILL.md` | `SkillPackage` attached through `SkillsMiddleware` |
| MCP server | `browser-lab` | `mcp.json` + `mcp/browser-lab-mcp.js` | Plugin-managed `XpertToolset` |
| App requirement | `browser-session` | `apps/browser-session.json` | App connector requirement / auth state |
| Hooks | `hooks` | `hooks/hooks.json` | `PluginHooksMiddleware` hook profile |
| Assets | composer icon, logo, screenshot | `assets/*` | Marketplace and plugin UI metadata |

The assistant template `browser-research-assistant` declares dependencies for the same resources. Installing the template should create a new Xpert and attach the skill, MCP toolset, hook middleware, and app requirement to `Agent_XpertAIBrowserResearch`.

## Demo paths

Install the assistant template into a workspace:

```http
POST /xpert-template/browser-research-assistant/install
Content-Type: application/json

{
  "workspaceId": "workspace-id",
  "basic": {
    "name": "Browser Research Assistant"
  }
}
```

Install all Browser Lab resources into a workspace without changing an Xpert runtime graph:

```http
POST /plugin/@xpert-ai%2Fplugin-browser-lab/resources/install-workspace
Content-Type: application/json

{
  "workspaceId": "workspace-id",
  "components": [
    { "componentType": "skill", "componentKey": "browser-research" },
    { "componentType": "mcp_server", "componentKey": "browser-lab" },
    { "componentType": "app", "componentKey": "browser-session" },
    { "componentType": "hook", "componentKey": "hooks" }
  ]
}
```

Install and bind the resources to an existing Xpert agent:

```http
POST /plugin/@xpert-ai%2Fplugin-browser-lab/resources/install-xpert
Content-Type: application/json

{
  "xpertId": "xpert-id",
  "agentKey": "Agent_XpertAIBrowserResearch",
  "components": [
    { "componentType": "skill", "componentKey": "browser-research" },
    { "componentType": "mcp_server", "componentKey": "browser-lab" },
    {
      "componentType": "hook",
      "componentKey": "hooks",
      "events": ["SessionStart", "PreToolUse"]
    },
    {
      "componentType": "app",
      "componentKey": "browser-session",
      "auth": "on_first_use"
    }
  ]
}
```

In the plugin settings UI, the installed plugin card should show one skill, one MCP server, one app, and one hook. The Resources dialog reads live bundle definitions, installs workspace resources, or attaches them to an existing Xpert.

Build with:

```bash
pnpm nx build browser-lab
```

Validate the demo bundle with:

```bash
pnpm nx test server --testFile=packages/server/src/plugin/plugin-bundle-manifest.spec.ts --runInBand
pnpm nx test browser-lab --runInBand
```
