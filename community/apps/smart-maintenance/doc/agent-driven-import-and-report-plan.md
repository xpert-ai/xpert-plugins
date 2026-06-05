# Agent-Driven Import And Report Implementation Plan

**Goal:** Make smart maintenance report creation and service-data upload run through the Agent and middleware tools, with plugin persistence only happening inside those tools.

**Architecture:** The remote component sends Assistant chat commands for AI work. File upload uses a plugin file action only to parse and prepare a draft payload; the Agent must call the import middleware tool to persist service data. The workbench reads the latest imported service-data snapshot and falls back to the mock catalog when no import exists.

**Scope:** Only files under `packages/plugins/smart-maintenance` are changed.

## Tasks

- [ ] Add tests for Agent-triggered report creation, Agent-triggered upload import, import middleware exposure, and persisted service data.
- [ ] Add a service-data snapshot entity and service methods for importing and reading current catalog data.
- [ ] Add `smart_maintenance_import_service_data` middleware tool.
- [ ] Add a file action that parses JSON/CSV/Excel into a draft payload without saving it.
- [ ] Update the remote component to invoke Assistant chat for report creation and upload import.
- [ ] Generate `examples/service-data-complete.xlsx` from the JSON example.
- [ ] Run unit tests, build, reinstall the plugin, and verify in the local Xpert preview.
