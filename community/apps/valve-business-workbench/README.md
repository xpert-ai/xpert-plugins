# Valve Business Workbench

`@xpert-ai/plugin-valve-business-workbench` is a system-level Xpert Agentic App for using published valve ontology models and data in day-to-day engineering work.

It provides a Studio-style Workbench, native Agent middleware tools, a context-aware business operation Skill, a managed Assistant template with conversation starters, governed proposal persistence, plugin-owned customer Demo Action adapters, and an explicit user-confirmed initializer for its own valve ontology bundle. It does not install an MCP client, mutate unrelated ontology definitions, initialize data silently during plugin installation, or write to real ERP/EAM/QMS/DCS/SIS systems.

## Capabilities

- Ready-resource discovery with exact `valve` entity type validation.
- Bounded object search and single-object 360 views.
- Properties, one-hop relations, related objects, evidence, constraints, and action definitions.
- Versioned Workbench-to-Assistant context.
- Pending-review ontology action and engineering review proposals.
- Action discovery and preflight against snapshot, input, duplicate work, constraints, and adapter availability.
- Human approval/rejection followed by explicit Demo execution with queued/started/completed-or-failed audit events.
- Built-in maintenance work order, inspection, quality deviation, spare part, replacement review, and isolation simulation scenarios.
- Chinese and English UI with shared shadcn primitives, host theme tokens, a collapsible Studio navigator, and internal panel scrolling.
- Code-owned valve Schema, seven governed Action definitions, and neutral demo instances/relationships that users can explicitly import and publish to data-xpert.
- A bundled `valve-business-operations` Skill that resolves current Workbench context and guides evidence review, Action preflight, proposal creation, and audit.

## Configuration

```json
{
  "enabled": true,
  "demo": {
    "enabled": true,
    "includeFallbackActions": true
  },
  "dataXpert": {
    "apiBaseUrl": "http://localhost:3001",
    "rootEntityTypeCode": "valve",
    "resourceIds": ["optional-ready-resource-id"],
    "definitionResourceId": "optional-definition-resource-id",
    "timeoutMs": 15000,
    "resultLimit": 30
  }
}
```

`resourceIds` is an optional allowlist. Every selected resource must be active, ready, and contain the exact configured root entity type code. The plugin never guesses a resource from display names.

## Security model

The server obtains a short-lived Actor Token from `ActorTokenRuntimeCapability` and sends it only to the configured data-xpert API with the current organization header. Tenant, organization, actor identity, and API address are never accepted as model or iframe inputs. The token is never sent to the Remote View.

Ontology initialization is a separate, user-confirmed lifecycle. The server fixes the resource id and semantic version, writes one complete draft, validates it, and publishes it. If an unpublished draft already exists, the UI requires an explicit overwrite confirmation; published history is retained.

The Assistant can discover and preflight Actions and create a `pending_review` proposal only. Approval, rejection and Demo execution are available only as confirmed Workbench actions and are recorded as audit events. Demo execution creates simulated references only.

## Tools

- `valve_list_resources`
- `valve_get_schema`
- `valve_search_objects`
- `valve_get_object_360`
- `valve_discover_actions`
- `valve_preflight_action`
- `valve_list_action_proposals`
- `valve_create_action_proposal`
- `valve_get_audit_trace`

All tool schemas are strict and bounded. Target resolution is explicit tool input, then current Workbench context, then fixed plugin configuration. Otherwise the tool returns `NO_ACTIVE_CONTEXT`.

## Development

```bash
cd /Users/xpertai/Pro/xpert-plugins/community
pnpm --filter @xpert-ai/plugin-valve-business-workbench test
```

The build type-checks TSX, compiles the consumer Tailwind CSS source scan, bundles the Remote View with Vite/esbuild, emits `app.js` and `app.css`, compiles the Nest plugin, and copies runtime assets. Do not edit generated `app.js` or `app.css` manually.

## Local deployment

Use the repository plugin deployment lifecycle and the global credentials in `community/.env`. Configure the plugin explicitly with `http://localhost:3001`. Open the Workbench and click **初始化本体** to import and publish the plugin-owned model when the resource is not yet present. Provisioning the managed Assistant remains a separate lifecycle from plugin deployment and ontology initialization.

See [docs](./docs/index.mdx) for architecture, permissions, installation, and acceptance criteria.
