# Implementation log

Current delivery: 0.3.0 contains only the two context-menu reference actions. Earlier sections below are historical snapshots, including removed AI panels. See [current interview materials](../README.md).

## Plugin PR preparation — 2026-09-14

At the user’s request, prepared update/dockyard-workbench against upstream main with all six interview documents. Re-ran build, vendor integrity, 56 upstream and 11 plugin tests, typecheck, dist freshness, and the 0.3.0 dist-first lifecycle harness (mocks enabled). No browser validation, host restart or storage migration. Remaining UI/screenshot and host dependency limitations are disclosed in the draft PR.


## Save completion race — 2026-09-14

Added a regression reproducing a save requested after an idle drain but before its Promise cleanup. Previously the second flush reused the finished Promise, never persisted the new value and could still report saved. The regression failed with zero persistence calls before the fix. `set` now tracks actual saving/error state; a concurrent flush rechecks pending work after the preceding task settles. Network failures still propagate without automatic retry.

Verification after the fix: all 56 upstream tests and 16 plugin tests passed, including three save-queue cases; server/remote compilation and generated-resource consistency passed. Browser and real-model acceptance remain pending. Earlier counts and package hashes below are historical; rebuild/repack before delivery.

## Current checkpoint — 2026-09-14

The sections below preserve earlier implementation snapshots, including failures later resolved. Current code includes the complete remote workbench adapter, serialized saves, AI preview/apply/cancel/undo panel, host message bridge, plugin entry and Assistant template. The latest full automated run passed all 56 upstream tests and 15 plugin tests, plus source-to-dist consistency. These results do not establish full Dockyard interaction parity or real-model acceptance.

The dedicated public host at commit `01aa0f76eb96ef88e8a435d7d99832c7b7138560` now passes API readiness and UI reachability. Both listener working directories resolve to that fresh checkout. Its tracked worktree is clean after restoring only the generated knowledge-workbench asset changed by the official build. Public host API bootstrap hardcodes all-interface binding; no host functional source was modified to work around it.

Deployment remains pending first-user initialization and task-specific credentials. The interview deployment launcher uses isolated environment variables and task-specific Keychain names; its default dry-run does not read Keychain. The first dry-run correctly stopped for a missing real tenant ID. No fabricated scope identifier, existing local Xpert credentials, browser session or model key was used. Actual plugin loading, Assistant publication, real model execution and complete D01–D39/N01–N10 application acceptance remain outstanding.

The initial package was inspected and imported from its extracted directory. Subsequent documentation changes require repackaging before final delivery; the earlier package hash is not the final artifact.

## 2026-09-14 domain and persistence implementation

Resolved the install failure by explicitly running Corepack with the current Node 22.22.1 process and system CA support. Kept TLS verification enabled, pnpm 8.15.8 and a project-local store. Public SDK/contracts 3.18.4 bundles reference undeclared axios/short-unique-id dependencies; package-local pnpm extensions provide the versions declared in the fresh public community checkout. Nest CQRS is aligned with public host 11.0.3. The upstream ChatKit/LangChain peer mismatch remains recorded for host acceptance.

Added strict layout intents, original-manager dry run/rollback, content-only auto-hide isolation, scoped database records, independent layout/buffer/scratchpad revisions, request idempotency/deadlines/cancellation, and atomic human application. Added Agent tools and View adapters. AI context intentionally excludes document bodies and UserData. Plugin entry/remote assets/template and actual host wiring are still incomplete.

Verification: original Node suite 56/56; new layout and SQL.js integration suite 10/10; TypeScript no-emit check passed. No browser, real host deployment or real model acceptance yet.

## Recording policy

Record each meaningful implementation step with its source/version, changed files, actual outcome, failures, follow-up and verification evidence. Preserve failed attempts and append retest results. Design mockups and source checks are not runtime acceptance evidence.

## 2026-09-14 dependency attempt and verification

The initial project-local Corepack install failed with `ERR_PNPM_BAD_PM_VERSION`: pnpm 12.4.1 was invoked while the community workspace requires 8.15.8. Version alignment and a successful retry are still pending. Do not treat dependencies, build or runtime tests as complete.

The vendor verification script passed for all 42 files at Dockyard commit `116dcd672cd6123de8ba798e1647e7ecf994a37c`. The fresh public host checkout is at `01aa0f76eb96ef88e8a435d7d99832c7b7138560`; its working tree was clean when checked. The plugin directory currently contains preparation files, not a completed working plugin.

## Initial preparation

2026-09-14: Started under the approved Dockyard parity plan. Vendored the original library, complete sample, docs and tests at a fixed public commit, preserving LICENSE/NOTICE and all file hashes. No host source changes. Chose the supported ESM Remote View to preserve the original DOM/CSS instead of recreating a different React UI. Tenant installation is supported by current public contracts and plugin management source; actual deployment remains unverified. Public SDK/contracts 3.18.4 availability checked through npm. Dependencies will be installed within this package with an isolated store; no global tools are upgraded.


0.3.0：按用户新范围移除旧 AI 面板、任务服务与工具，保留选区和文件树的两项右键 ChatKit 引用操作。历史数据结构保留；详细验证与未完成运行升级状态见项目 docs/20-简化版右键AI操作说明.md。
