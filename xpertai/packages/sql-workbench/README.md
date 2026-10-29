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

The compatible SDK release is 3.29.0. The affected plugins declare this minimum
version and the frozen lockfile resolves the published npm artifact. Upgrade the
host and database plugin group together; old plugins cannot load against the
host after it removes the SDK implementation exports.

## Verification

From the `xpertai` workspace:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run verify:database-workbench
```

Use a current supported Node release. The script builds and type-checks through
Nx against normally resolved npm dependencies, then runs the migrated SQL
regression suite, DB Studio tests and native database tests. It does not override
SDK declarations or replace installed packages. Native database tests use
fake I/O by default; the HANA live integration test is explicitly opt-in. Run the
plugin lifecycle harness separately as described in its README. These checks do
not establish live database or Dashboard browser acceptance.
