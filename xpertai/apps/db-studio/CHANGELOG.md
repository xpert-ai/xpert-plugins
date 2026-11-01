# @xpert-ai/plugin-db-studio

## 0.2.3

### Patch Changes

- b449475: Move MySQL, Doris and PostgreSQL SQL dialect, metadata and location handling from the platform SDK into their database plugins. Declare scoped workbench support on each strategy and retain shared parsing/execution helpers in the plugin repository. Migrate DB Studio off the removed SDK implementation exports.

  Add the hana.sql Analytics provider with HANA-owned discovery and parameterized read-only queries, exact numeric values, bounded results and cancellation. Saved tenant credentials remain host-owned; HANA validates its fixed tenant and selected schema.

  Requires platform SDK 3.29.0 or later in the 3.x series. Dependencies and the frozen lockfile use the published 3.29.0 release. Upgrade the host and these plugins together; older DB Studio and database plugins still import the removed SDK implementations.

- Updated dependencies [b449475]
  - @xpert-ai/sql-workbench@0.1.1

## 0.2.2

### Patch Changes

- 8777338: Refresh the DB Studio marketplace cover with the Meetings-style layout, green database branding, Chinese headline, and an illustrative SQL workbench. Keep the existing cover path and include the generation prompt and updated design specification.

## 0.2.1

### Patch Changes

- 49e8196: Fix CSV/JSON downloads for shared Assistants by removing the unused workspace file upload. Preserve query access checks, result expiry and user-scoped export receipts without creating another copy of the query result.

## 0.2.0

### Minor Changes

- 88c1f06: Publish refreshed application cover images and SVG/PNG icons, including bundled branding assets and marketplace screenshot metadata.
