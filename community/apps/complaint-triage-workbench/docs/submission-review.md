# Submission review and interview runbook

Date: 2026-09-18, Asia/Shanghai. Plugin 0.2.1, untracked/uncommitted. No Git submission or live environment change was performed during this review.

## Current gates

| Gate | Result | Scope |
| --- | --- | --- |
| Single-package fresh dependency installation | Passed, user installation | Corrected disposable app; ChatKit/Core peer warning remains |
| Isolated build and assets | Passed | Own TypeScript 5.9.3; no sibling bin fallback |
| Automated tests | 27 passed | In-memory/static/runtime doubles, not PostgreSQL or a real model suite |
| Lifecycle | Passed | Existing Harness runner against isolated app; host mocks enabled |
| Live plugin load | Previously observed | Host descriptor 0.2.1, loaded, system:global |
| Live normal flow | Previously passed | User confirmation and post-publication browser regression |
| Live failure/original-case Retry | User confirmed | Supporting final-state image; not an independently captured complete transition |
| Fresh community workspace, Complaint target | Passed | User installation, filtered build, 27 tests, mock-backed Harness and asset checks; not all workspace packages |
| Unmodified upstream host | Not verified | Live checks used local Windows compatibility patches |
| Exact implementation commit | Unavailable | Commit/push/PR remain separately authorized steps |

## Source review

No new high-severity defect was identified in this focused read-through. This is not a comprehensive security audit or real-database concurrency certification.

| Concern | Source and symbol | Review conclusion |
| --- | --- | --- |
| Validation | src/lib/domain/complaint.schemas.ts; createComplaintCaseSchema, complaintTriageResultSchema | Required trimmed inputs, bounded fields, strict objects and urgency enum |
| Trusted scope | src/lib/complaint-triage-view.provider.ts; scopeFromContext, executeAction | Business scope and analysis host come from resolved host context, not UI-supplied tenant/assistant IDs |
| Scoped reads/writes | src/lib/complaint-case.service.ts; complaintScopeKey, stateWhere, processingAttemptWhere | Reads and conditional updates include tenant/organization scope |
| Original-case Retry | ComplaintCaseService.retryAnalysis, beginAttempt | Existing ID updated; no createCase call, new attempt and incremented attemptCount |
| Stale/duplicate results | ComplaintCaseService.completeAnalysis | Current attempt and PROCESSING required; affected row count must be one |
| Human ownership | ComplaintCaseService.saveReview, confirmCase; src/lib/complaint-tools.ts | Tool submits AI result only; confirmation is a View action; AI original is not overwritten |
| Real AI dispatch | src/lib/complaint-assistant-task.service.ts; startCaseAnalysis | Host AssistantTaskRuntimeCapability invoked, task references persisted |
| Failure handling | startCaseAnalysis, reconcileCaseAnalysis; src/lib/domain/complaint-errors.ts | Start/status failures and missing structured writeback have retryable business failure paths; errors sanitized |
| Plugin registration | src/index.ts; register; src/lib/complaint-triage.plugin.ts | Module providers and TypeORM entities declared; YAML and UI assets copied by build script |
| UI safety/persistence | src/lib/remote-components/complaint-workbench/app.js; render, load, runAction | Displayed business strings escaped; parent-source/channel/instance checks; persistence through host bridge, not Web Storage |

Tests cover these guards but use doubles. Database-level concurrency, arbitrary provider error redaction, all model behaviors, and durable crash recovery remain outside the verified scope. UI lists only the first 30 records; unsaved human edits are lost on refresh/navigation. These limits must not be presented as production completeness.

## Host modifications: separate from plugin delivery

Reviewed against Xpert baseline 182f2f4a7d05d968016a9ec20a93833687c4394f. The following are existing local files, not changes made by this review and not proposed plugin PR contents:

| Host source | Local purpose | Compatibility boundary |
| --- | --- | --- |
| packages/plugin-sdk/src/lib/ai-model/ai-model-provider.decorator.ts | Decode file URLs and Windows stack paths for model-provider directory metadata | Live model-provider setup used the patched host; unmodified Windows behavior not certified |
| packages/server/src/plugin/plugin-loader.ts | Native ESM import and conversion of absolute paths to file URLs | Live ESM loading used this implementation; not evidence of stock-host loading |
| packages/server/src/plugin/organization-plugin.store.ts | Windows npm.cmd execution during staged runtime installation | A successful local install does not establish unmodified Windows staging behavior |
| packages/server/src/plugin/npm-exec.ts | Resolve npm-cli.js and invoke it via Node on Windows | Existing helper is untracked in host repo, not a plugin source file |
| packages/server/src/plugin/plugin-sdk-versioning.ts | Route npm registry calls through the Windows helper | Registry execution prerequisite differs from upstream baseline |
| packages/server/src/plugin/queries/handlers/resolve-latest-plugin-version.handler.ts | Same helper for latest-version lookup | Separate from business logic |

Related existing tests: ai-model-provider.decorator.spec.ts, organization-plugin.store.spec.ts, plugin-loader.spec.ts and npm-exec.spec.ts. They were not modified or rerun by this delivery review. Do not ship host patches covertly, claim they are all required for every deployment, or reset the active host to test compatibility. A supported unmodified-host run is still needed to close that gate; otherwise disclose the limitation to the reviewer.

## Interview demonstration sequence

This is a runbook, not a new execution record. Use fictitious complaint data and an authorized demo organization. Do not use production customer information or expose model credentials.

1. Show the plugin descriptor/version and open the initialized Complaint triage Workbench. Runtime load evidence is separate from a version badge.
2. Submit blank required fields: validation should reject creation. Create one valid fictitious case: record its reference/ID, DRAFT state and list count.
3. Analyze with AI: observe PROCESSING and then PENDING_REVIEW, with all seven structured fields. A normal chat reply is not sufficient proof.
4. Change a human review field and save. Refresh/select the same case: saved draft should recover while the AI original is unchanged.
5. Confirm as a human, refresh/re-enter, and verify the same reference, CONFIRMED state and human final result.
6. For Retry evidence, record one failed case's reference, attempt count and total count before Retry. Restore the authorized demo model setup if a controlled failure was induced. Retry that same case, observe attempt count increment, unchanged record count and PENDING_REVIEW. Do not create a replacement complaint.
7. Pair before/after captures from that same case. Existing POST-PUBLISH-025 failure and RETRY-021 final-state images cannot be joined into one case's transition sequence.

Controlled model failure changes host configuration and must be explicitly scoped/authorized before execution. Restore original configuration even if testing fails. This review did not run a new failure, Retry, model call or complaint creation. Previously attributed acceptance remains valid as recorded in acceptance.md.

## Submission contents and checks

Candidate source scope: community/apps/complaint-triage-workbench/ only, unless necessary root metadata is separately reviewed. Include source, tests, YAML, package/build settings, asset-copy script, README and docs/evidence. Exclude dist, node_modules, .env*, tokens, private logs and disposable verification directories. The workspace lock is currently ignored; do not add an unrelated repository-wide lockfile.

Before authorized commit: review candidate file list and secret-pattern results without printing credentials; inspect licenses, ignored artifacts and diff whitespace. After commit: record the implementation SHA from Git and verify a source copy from that exact commit so missing untracked files cannot be hidden by the working directory. Do not label the upstream baseline as the implementation SHA.

Current checks: source candidate list reviewed; no dist, node_modules, environment file or log included. Scoped JWT/long sk-key and trailing-whitespace scans had zero matches, not a comprehensive secrets audit. Community entity-name checker passed; the App uses complaintTable('case') rather than a literal table name, so the generic scanner alone is not proof of this App's table prefix. Existing isolated lifecycle Harness was rerun successfully. No business source/test/script drift from the passing isolated copy was found. Workspace attempt/configuration findings and the exact continuation command are in [workspace-verification.md](workspace-verification.md).

Latest package dry-run passed with 76 entries and explicitly includes both review/verification reports, runtime JS, Assistant YAML and UI JS/CSS; environment, dependency and test paths are excluded. No tarball was created or published. Candidate source review covers 41 files, including 33 text files and eight screenshots. A clean scan is not a guarantee against every secret or privacy format.

Submission target: origin Darlingair1/xpert-plugins, feat/complaint-triage-workbench -> upstream xpert-ai/xpert-plugins, main. Commit, push and PR creation have not been performed. No npm release, Skills PR or additional product feature is planned.
