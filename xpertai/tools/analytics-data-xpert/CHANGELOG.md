# @xpert-ai/plugin-analytics-data-xpert

## 0.3.0

### Minor Changes

- 8588d66: Validate source-specific authority before delegating dataset analysis to a group. Data Xpert checks the current human's data-administrator and binding permissions through its authenticated qualification endpoint. File datasets require management of the source Project and access to the exact declared file. Qualification reads no business rows and does not replace each later query's caller permissions.

## 0.2.0

### Minor Changes

- fbd2708: Expose explicit resource and entity discovery for dashboard imports through the Analytics query contract. Return provider-owned target patches that preserve native Action arguments and parameter paths, without inferring SQL or MDX semantics from display names. Resource discovery and imported queries continue to use the current actor's authorization.

### Patch Changes

- 4761c96: Require Xpert contracts and plugin SDK 3.32.0 or a compatible later 3.x release to forward validated DataXpert diagnostics during discovery and execution. Unrecognized upstream errors expose only their HTTP status.
- ba4f160: Preserve declared DataXpert result-column metadata and discover binding output schemas through authorized read-only queries before dashboard preview. Keep exact decimal values and legacy authored bindings compatible with the existing SDK runtime.

  Generate valid dataset IDs at the discovery boundary when callers omit the local key or supply a native cube reference, preserving valid authored IDs and the native query target.

## 0.1.2

### Patch Changes

- 3afcd71: Use canonical Analytics sources: database connections, immutable Definitions and script Artifacts. Move the five native Providers out of DataSource Types, expose their configuration entries and update Live Dashboard authoring, rendering and sharing. Requires published platform Contracts/SDK 3.26.1 containing the canonical Analytics API; no historical Binding decoder or migration is included.

  Generate Files/REST/MCP/data-xpert Definitions through the Live Dashboard Agent using authorized input discovery, actual-data validation and immutable registration receipts.

  Fix dashboard viewer parsing of canonical Definition and Artifact source references so Agent-generated drafts can be opened, filtered and published.

- f1b700d: Require published SDK and Contracts 3.26.1 and pin development builds to the same release. Use the canonical Analytics, integration permission, Connector scope and connection command contracts instead of local SDK type extensions or platform dependency overlays. Preserve authorization checks for optional host capabilities and existing configuration migration behavior.

## 0.1.1

### Patch Changes

- 19ac008: Publish the first patch release of Live Dashboard and the analytics providers through the GitHub Actions `release-plugin.yml` trusted publisher after the manual npm 0.1.0 bootstrap release.

  Ship the packages from the xpertai workspace with repository metadata for trusted publishing, published SDK/contracts 3.25.0, and the published Data Analytics renderer. Clean builds resolve the required runtime capabilities without local platform or cross-workspace links.
