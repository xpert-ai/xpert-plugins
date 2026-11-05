# Isolated installation verification

Date: 2026-09-18 (Asia/Shanghai). Plugin: 0.2.1, uncommitted. Latest result: corrected single-package isolated INSTALL / BUILD / 27 TESTS / MOCK-BACKED HARNESS PASSED. Earlier pre-correction failures below are preserved. This is not a clean installation of the entire community workspace or platform.

## Dependency-only correction and current verification

The source package.json now follows `community/apps/dockyard/package.json`: packageManager pnpm 8.15.8; LangChain Core peer ^0.3.72/dev 0.3.72; CQRS peer ^11.0.3/dev 11.0.3; exact pnpm packageExtensions for contracts 3.18.4 -> short-unique-id 5.3.2 and SDK 3.18.4 -> axios 1.12.2. Business source, plugin version, platform dependencies, credentials and complaints were not changed.

A new disposable source copy at `G:\Xpert\complaint-corrected-clean-20260918\apps\complaint-triage-workbench` excludes dependencies, build output and environment files. The old failing directory/lockfile was preserved. Offline installation using the user's earlier package store failed at missing Core 0.3.72; network retry failed with registry EACCES. The escalated retry was not executed because the approval service returned HTTP 503. No approval bypass was attempted. The user subsequently completed installation; screenshot b51e21c3 shows Done in 9.6s, with the disclosed ChatKit/Core peer warning.

At approximately 14:42 (Asia/Shanghai), corrected isolated build and all 27 tests passed, exit 0, with sibling platform/community bin fallbacks removed from PATH. Harness against this same isolated app passed, exit 0: plugin 0.2.1 loaded, onStart/onStop completed, context closed, mocks enabled. The existing Harness runner was not itself freshly installed. No real database/model business flow was rerun in this check.

Source and isolated package.json SHA256 both equal `0c691695a03e24b1dec649518795c9324d53883c2203509345822a9a84aa2ca4`; corrected disposable pnpm-lock.yaml SHA256 is `416f184de2aa88ae1774c3f003eaf530fe7c7a14babe8b1b96b4113ccf7c02e4`. Actual dependency paths resolve inside this app's node_modules/.pnpm: TypeScript 5.9.3, Nest Core 11.1.13, CQRS 11.0.3, LangChain Core 0.3.72, contracts/SDK 3.18.4. Resolution from contracts finds short-unique-id 5.3.2; resolution from SDK finds axios 1.12.2 and Core messages. No installed third-party bundle was patched.

Package-local pnpm extensions apply to this standalone installation. In a community workspace install, pnpm configuration must be effective at the workspace root; nested package settings alone do not repair SDK publishing metadata there. No community root dependency/settings change was made. The upstream ChatKit/Core peer mismatch remains a disclosed risk, not silently overridden or established as compatible.

Existing-workspace build using the sibling platform TypeScript compiler and asset-copy script passed, all 27 tests passed, and lifecycle Harness passed with mocks enabled. These are not fresh-dependency or database/model integration results. The normal package build command currently cannot locate tsc in this existing workspace; the successful fallback compiler build is not dependency-isolation proof.

Corrected installation command completed by the user:

```powershell
Set-Location 'G:\Xpert\xpert-plugins\community'
$env:COREPACK_HOME = 'G:\Xpert\.corepack-cache'
$verifyApp = 'G:\Xpert\complaint-corrected-clean-20260918\apps\complaint-triage-workbench'
corepack pnpm --dir "$verifyApp" install --ignore-scripts --store-dir 'G:\Xpert\complaint-clean-42906bb4c2ff476fa623590fb9510572\.pnpm-store'
```

The build/test/Harness commands below were then executed against this corrected `$verifyApp`, removing sibling bin fallbacks from PATH. Keep build, plugin lifecycle and real business acceptance separate. This closes the scoped single-package dependency-isolation gate only; workspace-root installation and upstream ChatKit compatibility are not established by these passes.

## Isolation evidence

- Source: `community/apps/complaint-triage-workbench` at plugin baseline `759e5a547d39f53dbafc7c58642936ebb104f121`.
- Disposable root: `G:\Xpert\complaint-clean-42906bb4c2ff476fa623590fb9510572`.
- App: `apps/complaint-triage-workbench` under that root, with the unchanged community `tsconfig.base.json` two levels above.
- Copy excluded `node_modules`, `dist`, `.git`, `.env`, `.env.*`, and tarballs. Before installation, no dependencies or build output were present.
- All 38 copied files matched the original bytes before this report/documentation update; no environment file was copied.
- Copied package.json SHA256: `f2da9492130a9bb6a13d89b1bec0aa664341c6cfeb768ba94923d751f1a5068f`.
- Actual Node: v24.14.0. Actual community Corepack pnpm: 8.15.8.
- No Xpert `.bin` fallback or existing-project dependency links were added. API/UI, model settings, credentials, and complaints were not changed.

This is a single-package dependency-isolation check using the package's declared dependencies and the repository's shared TypeScript configuration, not a clean installation of the entire community monorepo or Xpert platform.

## Results

| Stage | Result | Evidence |
| --- | --- | --- |
| Fresh source/configuration copy | Passed | Byte-for-byte copy check; no copied dependencies/output/credentials |
| Initial agent network installation, fresh local store | Blocked, exit 1 | npm mirror HTTPS connections returned EACCES; resolved metadata is not installation success |
| Escalated network retry | Not executed | Approval review service returned HTTP 503; no approval bypass was attempted |
| Offline installation, existing package store | Failed, exit 1 | ERR_PNPM_NO_OFFLINE_TARBALL for @nestjs/common 11.1.13 |
| User network installation in same disposable app | Completed, with peer warnings | User screenshot 383eaad4 shows Done in 24.2s; pnpm lockfile and local installation metadata independently inspected |
| Isolated build | Passed, exit 0 | Locally installed TypeScript 5.9.3; sibling Xpert/community bin fallbacks removed from PATH |
| Isolated tests | Failed, exit 1 | All four test files fail during module import: contracts cannot resolve short-unique-id; 27 individual business tests did not execute |
| Isolated lifecycle Harness | Failed, exit 1 | Built plugin import fails on the same missing short-unique-id, before lifecycle starts |

The initial offline attempt used a normal pnpm package cache, not another project's node_modules, but the cache was incomplete. Those failed attempts generated no lockfile. The later user network installation generated pnpm-lock.yaml, SHA256 `39f9f8ccf86829e60b7ff1c0e9da61a4726b4b814e2ced9697f0e5885d0ba43d`. Dependencies remain outside the plugin repository and are not deliverables. The installed layout is pnpm isolated, not the existing workspace's shared/linked dependency environment.

## Post-install source evidence

- The disposable package.json still matches the source SHA above; no dependency or business-code edits were made for this check.
- Actual local versions: contracts/SDK 3.18.4, Nest common/core 11.1.13, TypeScript 5.9.3. Each real path resolves inside this disposable app's node_modules/.pnpm, not the sibling platform.
- Runtime/type entry, Assistant YAML and UI JS/CSS were emitted. The copied UI JS exactly matches the source. This is artifact/build evidence, not plugin load evidence.
- Installed contracts `index.cjs.js:3` calls require('short-unique-id'); its published package.json does not declare it. A static top-level require resolution check confirmed MODULE_NOT_FOUND.
- Installed SDK `index.cjs.js` directly requires axios and LangChain Core subpaths. The same resolution check confirmed missing axios and @langchain/core. These are additional import blockers; runtime stops at the earlier contracts error before reaching them.
- Generated pnpm lockfile resolves SDK's unconstrained CQRS peer to 12.0.0, which requires Nest 12 while the plugin declares Nest 11. Its ChatKit Types 0.5.9 peer requires LangChain Core ^1.0.2, while SDK's OpenAI 0.6.9 requires >=0.3.68 <0.4.0. These warnings are documented incompatibilities, not proof that every affected path has failed at runtime.
- Repository evidence: `community/apps/dockyard/package.json` already provides packageExtensions for contracts 3.18.4 -> short-unique-id 5.3.2 and SDK 3.18.4 -> axios 1.12.2, with LangChain Core 0.3.72 and CQRS 11.0.3 in peer/dev dependencies. Its `docs/implementation-log.md` records these SDK publishing gaps and the remaining upstream ChatKit/LangChain peer mismatch. Platform root package.json also pins Core 0.3.72. Do not blindly install the newest conflicting peer versions.

This single-package check omits community root dependencies; community/package.json declares short-unique-id and axios, which can mask these published-package gaps in a shared layout. A clean community-workspace verification remains separate. The Dockyard pattern is a source-backed candidate for dependency-only remediation, not a fix already applied or verified here.

Earlier active-workspace build, 27 tests, and mock-backed Harness passes remain separate historical results. They do not close this fresh-install gate. The runtime business acceptance likewise remains separate.

## Exact attempted commands

Run from the existing `xpert-plugins/community` directory to select its declared pnpm 8.15.8:

```powershell
$env:COREPACK_HOME = 'G:\Xpert\.corepack-cache'
$verifyApp = 'G:\Xpert\complaint-clean-42906bb4c2ff476fa623590fb9510572\apps\complaint-triage-workbench'
$verifyStore = 'G:\Xpert\complaint-clean-42906bb4c2ff476fa623590fb9510572\.pnpm-store'
corepack pnpm --dir "$verifyApp" install --ignore-scripts --fetch-retries=0 --fetch-timeout=15000 --store-dir "$verifyStore"
```

The same network command was submitted for escalation; execution was rejected because the approval review service was unavailable. Offline fallback:

```powershell
corepack pnpm --dir "$verifyApp" install --offline --ignore-scripts --store-dir 'G:\Xpert\.pnpm-store'
```

## Post-install commands executed

```powershell
corepack pnpm --dir "$verifyApp" build
corepack pnpm --dir "$verifyApp" test
node 'G:\Xpert\xpert-plugins\plugin-dev-harness\dist\index.js' --workspace "$verifyApp" --plugin '@xpert-ai/plugin-complaint-triage-workbench'
```

For build/test, sibling Xpert/community node_modules/.bin fallbacks were removed from the process PATH. The existing Harness runner was used against the disposable app and resolves its plugin/Nest dependencies from that app; it was not reinstalled as part of this check.

## Historical pre-correction resume gate

Network installation has now completed through the user's terminal. The remaining blocker is dependency declaration/resolution, not platform startup or token expiration. Review a dependency-only remediation based on Dockyard's current metadata, account for package-local versus workspace-root pnpm extension scope, then reinstall/rebuild/retest and rerun the Harness in isolation. Do not change business code, upgrade SDKs blindly, patch installed third-party bundles, copy dependency trees, or restart the live platform as a verification shortcut.

The expected business test count remains 27. Any later pass must use an actual complete, compatible dependency tree; Harness mocks do not prove database/model business behavior. Preserve the current failing lockfile/result as evidence rather than relabeling it as passed.
