# Factory Intelligent Operations and Anomaly Recovery Center

`@xpert-ai/plugin-factory-operations` is an Xpert Agentic App for investigating factory anomalies, reconciling specialist findings, approving a recovery plan, executing governed simulator actions, and verifying production recovery. Version 0.4 gives every Factory Case a unique Xpert Project, runs the Orchestrator and eight independent role Assistants in that Project workspace, provides an ECharts management dashboard, and exposes an organization-scoped `appConfig` management entry.

The first vertical slice implements the M-07 grinding-center failure scenario. It includes a versioned pipeline, tenant-scoped persistence, bounded Agent middleware tools, an independent Assistant suite, a multi-Agent swimlane Remote View, and a read-only management dashboard.

## Host-native MCP capabilities

The plugin declares two business providers with class-level `@XpertToolProvider()` metadata and method-level `@XpertTool()` contracts. Xpert discovers `factory_ops` for seven recovery mutations and `factory_ops_insights` for five read-only operations, while deriving the existing ten Agent Middleware strategies from the same business methods. Every invocation runs in-process with authenticated tenant, organization, principal, and execution context. No stdio MCP server is created, and the manifest does not need a `toolsets` entry.

The provider exposes five reads and seven idempotent writes from the same DTO-returning handlers:

- Reads: `factory_cases_search`, `factory_case_get_summary`, `factory_case_get_progress`, `factory_operations_dashboard_get`, `factory_execution_status_get`
- Writes: `factory_event_triage_record`, `factory_equipment_diagnosis_record`, `factory_quality_impact_record`, `factory_production_impact_record`, `factory_resource_readiness_record`, `factory_recovery_plan_generate`, `factory_recovery_verification_record`

`factory_operations_dashboard_get` and `factory_case_get_summary` also open host-native MCP Apps. Their packaged, localized HTML views render the returned `structuredContent`, use the host `--mcp-app-*` theme variables, and may refresh only through the same app-visible read Tool. The iframe never receives a tenant identifier, organization identifier, API Key, or direct backend URL.

MCP never exposes plan approval, rejection, or execution. Those actions remain in the authenticated human governance workflow. A Super Admin can independently enable or disable either Provider from the MCP section of the plugin detail dialog. Each first enable creates or adopts its organization Toolset and managed Publication, synchronizes that Provider's tools, and creates a least-privilege API key only when one does not already exist. See [`docs/mcp-publication.mdx`](./docs/mcp-publication.mdx).

## Local validation

```bash
corepack pnpm install
corepack pnpm check
```

Detailed architecture, configuration, and operations guidance lives under [`docs/`](./docs/).

## Assistant Profile（0.5.0）

新增“最近案件”“待处理”资料卡 tabs，以及 owner / manager 的“批准并继续”。审批后由持久化续跑服务派发真实验证 Assistant Task；模拟执行保持明确标记，外部适配器缺失时阻塞。参见 [资料卡使用说明](docs/product/views/assistant-profile.mdx) 和 [验收清单](docs/acceptance.mdx)。此版本需要包含 Assistant Profile contracts 与 `platform.project.access` runtime capability 的配套 Xpert 平台。
