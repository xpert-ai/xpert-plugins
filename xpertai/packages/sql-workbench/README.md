# SQL workbench support for database plugins

Shared SQL parsing and bounded connection execution for the plugin repository.
The platform SDK owns `DatabaseWorkbenchAdapter` and wire types; this package owns
no registry, credentials or host authorization policy.

`SqlWorkbenchAdapter` is an abstract execution helper. Each plugin supplies its
engine identifier, identifier quoting, namespace rules, pagination, read-only
transaction/explain syntax, capabilities and metadata queries:

- `databases/mysql`: MySQL and Doris adapters (Doris keeps its specialized query and Stream Load path).
- `databases/postgres`: PostgreSQL adapter and dedicated `pg` transport.
- `databases/hana`: independent native read-only adapter; it does not inherit this helper.

The SQL lexer/classifier retains the previous conservative policy. Passing that
policy is not a substitute for the native database account's permissions.
`quoteSqlIdentifier` accepts an explicit delimiter, never a platform engine list.
DB Studio consumes these helpers as a plugin dependency; the host does not import them.

## Registration and location

A database strategy explicitly declares `workbench: { engine: '<stable-id>' }`.
Its runner implements `getWorkbenchAdapter(location?)`. The host selects the
strategy by the saved source type and creates an independent runner with saved
credentials. Only the typed database/schema/catalog location is passed to the
plugin. Location validation must preserve credential and connection boundaries.
Plugins without the declaration remain unavailable to the scoped workbench.

## Coordinated SDK migration

This change removes concrete SQL implementations from the platform SDK. Replace
imports of SDK `SqlDatabaseWorkbenchAdapter`, `WorkbenchTransport`, SQL parsing and quoting
helpers with plugin-owned implementations or this package. The old mixed-engine
adapter constructor is not retained; instantiate the corresponding plugin adapter.

Before release, publish the companion SDK patch version, set the affected plugin
SDK dependencies to the actual compatible version, and regenerate the frozen lock.
The review branch intentionally remains draft until that release gate is complete.

## Verification

From the plugin repository root, after building the companion platform SDK and
`@xpert-ai/plugin-shadcn-ui` dependency:

```sh
node plugin-dev-harness/verify-database-workbench.mjs "$XPERT_PLATFORM_ROOT/packages/plugin-sdk/dist"
node --test xpertai/databases/mysql/tests/*.test.mjs xpertai/databases/postgres/tests/*.test.mjs xpertai/databases/hana/tests/*.test.mjs
```

Use a current supported Node release (verified with Node 24). The paired script
checks emitted SDK declarations without patching installed dependency files, runs
the migrated SQL regression suite and DB Studio tests. Native database tests use
fake I/O by default; the HANA live integration test is explicitly opt-in. Run the
plugin lifecycle harness separately as described in its README. These checks do
not establish live database or Dashboard browser acceptance.
