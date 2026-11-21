# Link built platform packages for local development

Use `scripts/use-platform-packages.mjs` when a plugin needs to compile or test
against the public contracts and SDK built from a specific Xpert or Xpert Pro
checkout. It changes development symlinks only; it does not deploy a plugin,
restart the host, or establish runtime compatibility.

## Prepare and preview

Update the relevant checkouts and install their frozen dependencies first. Build
the host contracts and plugin SDK using the host's build commands. Each selected
plugin must already declare `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk` in its
dependencies, devDependencies, peerDependencies, or optionalDependencies.

From this repository root, preview the exact package paths and affected links:

```sh
node scripts/use-platform-packages.mjs --dry-run \
  ../xpert-pro community/apps/margin-improvement community/apps/order-evidence
```

Apply the same plan by omitting `--dry-run`:

```sh
node scripts/use-platform-packages.mjs \
  ../xpert-pro community/apps/margin-improvement community/apps/order-evidence
```

The existing positional command remains supported. Quote paths containing spaces.
All paths are resolved relative to the current directory; no machine-specific
checkout location is built into the script.

## Optional local ChatKit types

If the host builds also need a locally built `@xpert-ai/chatkit-types`, specify the
package directory containing its `package.json`, after building it:

```sh
node scripts/use-platform-packages.mjs --dry-run \
  --chatkit-types ../chatkit-js/packages/chatkit \
  ../xpert-pro community/apps/order-evidence
```

This additionally links the ChatKit package inside both host packages'
`dist/node_modules/@xpert-ai/` directories. Those host build directories are shared:
other local consumers of these builds also see the override. It does not change
the plugin's own ChatKit dependency or restart any service. Omit the option when
the host's normal ChatKit dependency is sufficient.

## Validation, receipts and recovery

- Before writing, the script checks package names, versions, declared runtime and
  type entry files, plugin dependency declarations, every target link, and receipt
  paths. It reads built files without importing or executing host package code.
- Existing symlinks, including broken links, can be replaced. Real directories
  and files at link targets are rejected. Duplicate plugins are collapsed; shared
  physical link targets are rejected.
- `--dry-run` prints the plan without creating links, directories or receipts.
  Applying an unchanged link is safe to repeat. Run the command while no package
  installation or build is modifying the same directories.
- On a write failure, the script attempts to restore links and receipt contents
  changed by that invocation. Any rollback failure is reported explicitly. Empty
  directories created during the attempt may remain.
- Each selected plugin receives `node_modules/.xpert-host-sdk.json`. The receipt
  contains resolved paths, package versions, SHA-256 hashes of the inspected root
  entry/type files, and each link's previous and new target. These hashes describe
  those files, not every file or export in the package. The receipt contains local
  paths and stays in `node_modules`; do not commit it.

Keep the receipt if you need to restore the previous local link targets. A later
invocation replaces it with that invocation's before/after state. To return plugin
dependencies to the registry, run `corepack pnpm install --frozen-lockfile --force`
in the owning plugin workspace. This does **not** remove optional ChatKit links
inside the host's `dist` directories: restore their previous targets from the
receipt, or remove only the recorded overrides before rebuilding those host
packages. Reapply local links after an install or clean build when needed.

The script never edits `package.json` or a lockfile. Keep published package
versions in committed dependency declarations. Local linking does not prove npm
availability, release reproducibility, or live plugin behavior; validate those
separately when preparing a release.

## Script tests

```sh
node --test scripts/use-platform-packages.test.mjs
```

Tests use temporary package trees, including failures during link and receipt
writes. They do not change an installed plugin or require a running Xpert server.
