# Community workspace verification

Date: 2026-09-18, Asia/Shanghai. Latest result: USER INSTALLATION / FILTERED COMPLAINT BUILD / 27 TESTS / MOCK-BACKED HARNESS PASSED. This is a fresh community source copy with Complaint-targeted verification, not a build/test pass for every workspace package or an unmodified Xpert host.

## Completed verification

The user completed the filtered network installation; screenshot a9e64dbe shows Done in 5m 32.1s and workspace peer warnings. At approximately 15:10-15:11, filtered Complaint build and all 27 tests passed, exit 0, with active platform/community bin fallbacks removed from PATH. The existing Harness runner loaded the built 0.2.1 App from this disposable workspace and completed onStart/onStop and shutdown, exit 0, mocks enabled. Community entity-name check passed. No real model/database flow was rerun and no other workspace package was built/tested as part of this check.

The App's source/tests/scripts and package.json still byte-match the original source; UI JS/CSS and Assistant YAML in dist byte-match their sources. package.json SHA256: `0c691695a03e24b1dec649518795c9324d53883c2203509345822a9a84aa2ca4`. Generated disposable community pnpm-lock.yaml SHA256: `6ddf05946c5baed5ca262519657cba3aefb15755beee340db8b8870d595bb9eb`. The lockfile is not a proposed deliverable or implementation commit SHA.

Dependency resolution from the App and SDK/contracts contexts stays inside this disposable community node_modules/.pnpm: TypeScript 5.9.2, Nest Core 11.1.13, CQRS 11.0.3, LangChain Core 0.3.72, contracts/SDK 3.18.4, short-unique-id 5.3.2 and axios 1.20.0. The workspace root's existing axios range resolves differently from the standalone extension pin (1.12.2); no package version upgrade was edited into source. The SDK's Core messages path resolves to 0.3.72, not the Core 1.x shown for other workspace roles in the screenshot.

Workspace peer warnings remain disclosed. Current Complaint checks pass without a root metadata change; this is not proof of all ChatKit/other-role paths or a recommendation to suppress warnings. Earlier blocked attempts below are historical results, not the current gate status.

## Source and isolation

- Baseline: xpert-plugins HEAD 759e5a547d39f53dbafc7c58642936ebb104f121.
- A tracked-source Git ZIP archive was extracted to `G:\Xpert\complaint-community-zip-check-20260918\repo` without a Git checkout/history mutation.
- ZIP SHA256: `737d5181be78bf24945e8457f8344783a6aec7fc83fbab3567106c5ee55570a2`.
- The uncommitted Complaint App was copied into community/apps, excluding node_modules, dist, .git, .env*, archives and logs. No active dependency tree was reused.
- Root package.json, workspace YAML, .npmrc, shared tsconfig and App package.json byte-match the source checkout.
- App src/tests/scripts also still byte-match the separately passing single-package verification copy.
- Earlier TAR extraction into `G:\Xpert\complaint-community-check-20260918` failed on Windows filename handling. That incomplete copy was not used for installation proof. No directories were deleted.

## Historical installation attempts

Run Corepack from the original community directory to select declared pnpm 8.15.8; --dir selects the disposable target for pnpm. Running Corepack from a root without packageManager initially attempted pnpm/latest discovery, which was blocked by network EACCES. Correcting the working directory avoided that discovery; it was not evidence of a workspace dependency failure.

```powershell
Set-Location 'G:\Xpert\xpert-plugins\community'
$env:COREPACK_HOME = 'G:\Xpert\.corepack-cache'
$verifyCommunity = 'G:\Xpert\complaint-community-zip-check-20260918\repo\community'
$verifyStore = 'G:\Xpert\complaint-clean-42906bb4c2ff476fa623590fb9510572\.pnpm-store'
corepack pnpm --dir "$verifyCommunity" install --filter @xpert-ai/plugin-complaint-triage-workbench --offline --ignore-scripts --store-dir "$verifyStore"
```

Offline attempt: exit 1, ERR_PNPM_NO_OFFLINE_TARBALL for @types/node 22.18.6. pnpm resolved workspace metadata (1228 packages) but did not finish installation or create a community pnpm-lock.yaml. Resolution/progress is not installation success. Do not infer the final installed tree from the single-package lockfile.

The same filtered installation without --offline was requested with escalated network permission. Approval review returned HTTP 503 and the command was not executed. No alternate network tool or approval bypass was used. Fresh-workspace build, tests and lifecycle could not be reached.

## Repository configuration finding

pnpm explicitly warns that the nested App's `pnpm` field does not take effect and must be configured at workspace root. The existing Dockyard nested field produces the same warning. Therefore package-local packageExtensions cannot be assumed to repair workspace-wide resolution.

community/package.json already declares axios ^1.12.2 and short-unique-id ^5.3.2. After installation completed, resolution from the SDK/contracts context found these packages in the disposable workspace. Existing root dependencies satisfy the tested Complaint import paths despite ignored nested extensions. No new root packageExtensions, override, tracked lockfile, or SDK upgrade was needed for this verified path; the upstream published metadata gaps themselves remain unchanged. Do not assume an independent npm production install will inherit these workspace dev dependencies.

## Completed commands / reproduction

The prepared ZIP-based source copy remains available. A user terminal can complete installation with:

```powershell
Set-Location 'G:\Xpert\xpert-plugins\community'
$env:COREPACK_HOME = 'G:\Xpert\.corepack-cache'
corepack pnpm --dir 'G:\Xpert\complaint-community-zip-check-20260918\repo\community' install --filter @xpert-ai/plugin-complaint-triage-workbench --ignore-scripts --store-dir 'G:\Xpert\complaint-clean-42906bb4c2ff476fa623590fb9510572\.pnpm-store'
```

After installation, the following commands completed successfully, with platform/active-community bin fallbacks removed from PATH:

```powershell
$verifyCommunity = 'G:\Xpert\complaint-community-zip-check-20260918\repo\community'
corepack pnpm --dir "$verifyCommunity" --filter @xpert-ai/plugin-complaint-triage-workbench build
corepack pnpm --dir "$verifyCommunity" --filter @xpert-ai/plugin-complaint-triage-workbench test
node "$verifyCommunity\scripts\check-entity-names.mjs"
node 'G:\Xpert\xpert-plugins\plugin-dev-harness\dist\index.js' --workspace "$verifyCommunity\apps\complaint-triage-workbench" --plugin '@xpert-ai/plugin-complaint-triage-workbench'
```

The Harness runner is not freshly installed and its default database/cache services are mocks; neither this nor workspace build establishes real model/database or unmodified-host compatibility.

No API restart, token refresh, host configuration change, complaint creation, commit, push or PR is required for this installation check.
