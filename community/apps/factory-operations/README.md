# Factory Intelligent Operations and Anomaly Recovery Center

`@xpert-ai/plugin-factory-operations` is an Xpert Agentic App for investigating factory anomalies, reconciling specialist findings, approving a recovery plan, executing governed simulator actions, and verifying production recovery. Version 0.4 gives every Factory Case a unique Xpert Project, runs the Orchestrator and eight independent role Assistants in that Project workspace, provides an ECharts management dashboard, and exposes an organization-scoped `appConfig` management entry.

The first vertical slice implements the M-07 grinding-center failure scenario. It includes a versioned pipeline, tenant-scoped persistence, bounded Agent middleware tools, an independent Assistant suite, a multi-Agent swimlane Remote View, and a read-only management dashboard.

## Local validation

```bash
corepack pnpm install
corepack pnpm check
```

Detailed architecture, configuration, and operations guidance lives under [`docs/`](./docs/).
