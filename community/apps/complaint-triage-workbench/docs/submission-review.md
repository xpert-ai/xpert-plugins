# Submission review and interview runbook

Date: 2026-09-19, Asia/Shanghai. Plugin 0.2.1; implementation committed at `4a115e6f398a1e6f16494c895ec0f8b0493293be` after user authorization. Earlier source review predates that commit.

## Current gates

| Gate | Result | Scope |
| --- | --- | --- |
| Single-package fresh dependency installation | Passed, user installation | Corrected disposable app; ChatKit/Core peer warning remains |
| Isolated build and assets | Passed | Own TypeScript 5.9.3; no sibling bin fallback |
| Automated tests | 27 passed | In-memory/static/runtime doubles, not PostgreSQL or a real model suite |
| Lifecycle | Passed | Existing Harness runner against isolated app; host mocks enabled |
| Live plugin load | Revalidated | Dedicated fresh-database environment reported 0.2.1 loaded |
| Live normal flow | Revalidated | 2026-09-19 user-confirmed create/validation, DeepSeek analysis, edit/save/confirm and reload |
| Live failure/original-case Retry | Revalidated | Controlled Primary disable/restore; same case retried, count unchanged, attempt incremented |
| Fresh community workspace, Complaint target | Passed | User installation, filtered build, 27 tests, mock-backed Harness and asset checks; not all workspace packages |
| Dedicated isolated host | Passed with disclosed host fixes | Fresh database and isolated ports; manual real-model/business acceptance, not automated |
| Unmodified upstream host | Not verified | Live checks used local Windows compatibility patches |
| Exact implementation commit | Verified | 4a115e6f398a1e6f16494c895ec0f8b0493293be; rebuilt, 27 tests and mock-backed Harness passed |
| Fork push | Passed through 0cf54302 | User push receipt and local HEAD/tracking ref confirm 0cf5430262cfb1cd5f16d6fde6d09fe0d5db371c; subsequent local Markdown updates are not committed/pushed |
| README delivery | Documentation gap closed | Direct relative-path screenshots, product/wireframes, reuse/license and representative AI collaboration; model labels confirmed by the candidate, not per-request API traces |
| Upstream PR | Not submitted | Form prepared; stock-host gate still open |

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

Controlled model failure changes host configuration and must be explicitly scoped/authorized before execution. On 2026-09-19 the candidate temporarily disabled Primary Copilot, observed FAILED, restored it, and passed same-case Retry without increasing the case count. The configuration was restored. This is SOURCE: USER manual acceptance, not an automated integration test.

## Submission contents and checks

Candidate source scope: community/apps/complaint-triage-workbench/ only, unless necessary root metadata is separately reviewed. Include source, tests, YAML, package/build settings, asset-copy script, README and docs/evidence. Exclude dist, node_modules, .env*, tokens, private logs and disposable verification directories. The workspace lock is currently ignored; do not add an unrelated repository-wide lockfile.

Before authorized commit: review candidate file list and secret-pattern results without printing credentials; inspect licenses, ignored artifacts and diff whitespace. After commit: record the implementation SHA from Git and verify a source copy from that exact commit so missing untracked files cannot be hidden by the working directory. Do not label the upstream baseline as the implementation SHA.

Current checks: source candidate list reviewed; no dist, node_modules, environment file or log included. Scoped JWT/long sk-key and trailing-whitespace scans had zero matches, not a comprehensive secrets audit. Community entity-name checker passed; the App uses complaintTable('case') rather than a literal table name, so the generic scanner alone is not proof of this App's table prefix. Existing isolated lifecycle Harness was rerun successfully. No business source/test/script drift from the passing isolated copy was found. Workspace attempt/configuration findings and the exact continuation command are in [workspace-verification.md](workspace-verification.md).

Initial package dry-run passed with 76 entries and explicitly includes both review/verification reports, runtime JS, Assistant YAML and UI JS/CSS; environment, dependency and test paths are excluded. The later delivery-report follow-up passed with 80 entries as recorded below. No tarball was created or published. Initial candidate source review covered 41 files, including 33 text files and eight screenshots. A clean scan is not a guarantee against every secret or privacy format.

Submission target: origin Darlingair1/xpert-plugins, feat/complaint-triage-workbench -> upstream xpert-ai/xpert-plugins, main. Push through 0cf54302 is complete; the subsequent model-label and verification-preparation Markdown updates await a separate commit/push after verification. The upstream PR has not been submitted. No npm release, Skills PR or additional product feature is planned.

## Authorized Git execution and committed-source verification

The implementation commit contains only 41 App files, with no host code, root metadata, environment files, dependencies or dist. git diff --cached --check passed. The pre-commit entity checker ran successfully with its existing namespace warning; runtime namespace metadata was not renamed to satisfy a scanner heuristic. Initial missing-sh failures were fixed for the invocation using Git's bundled shell and PATH; no hook was disabled and repository configuration was not rewritten.

Commit ZIP was extracted to `G:\Xpert\complaint-committed-source-4a115e6f\repo`. Git line-ending normalization caused raw-byte differences for some files; all 25 executable/build/test inputs match the verified workspace after CRLF/LF normalization. Those exact committed inputs were then copied into the disposable community App directory, rebuilt, and tested: build exit 0, 27/27 tests exit 0, lifecycle Harness exit 0 (approximately 15:19). This reuses the independently installed verification dependencies; it is not a second dependency installation or a new real-model/database test.

Push attempt using corrected shell and noninteractive credentials failed with inability to persist credentials in wincredman and terminal prompts disabled. Escalation request for the same Fork push returned approval-service HTTP 503; it was not executed. No credential was printed, no force push was attempted, and no alternate network path bypassed approval. GitHub CLI is not installed. No remote-main freshness check or PR creation was possible in this execution.

The initial push blockage below is historical: the user later pushed successfully and the GitHub comparison verified the prior HEAD. If an additional scoped documentation commit cannot be pushed by the agent, the same authenticated user-terminal command can publish it without force:

```powershell
Set-Location 'G:\Xpert\xpert-plugins'
git -c safe.directory=G:/Xpert/xpert-plugins push -u origin feat/complaint-triage-workbench
```

Authenticate through Git's normal account flow if prompted; do not share a personal access token in chat. After successful push, verify the Fork branch SHA, check current upstream main without rewriting local history, and create/check the upstream-main PR using the draft. Authorization is already granted, but a remote success must be observed before claiming submission complete.

## Delivery follow-up and independent-host handoff

README now directly embeds the existing real input/AI/confirmed/failure screenshots. New product.md, ai-collaboration.md and source-reuse.md document intended user pain, retrospective page wireframes, scope decisions, representative Codex collaboration and source/license boundaries. No new business source/test/config input was changed. The candidate confirmed coding model gpt5.6sol (GPT-5.6 Sol), DeepSeek official provider and Xpert business model deepseek-v4-flash (SOURCE: USER). This records labels, not a per-request API trace; no credential is recorded.

Read-only Docker and WSL inventory checks failed for the agent account with access denied; escalated checks also encountered approval-service failures. The candidate nevertheless completed the prepared isolated environment through their authorized terminal. The 2026-09-19 run passed plugin/model/business acceptance on fresh data, while the host's disclosed Windows/Auth fixes keep the unmodified-upstream-host gate open. Details are in [upstream-host-verification.md](upstream-host-verification.md).

Follow-up verification at approximately 15:55: the existing fresh-community copy rebuilt, passed 27/27 tests and completed mock-backed lifecycle shutdown. Its 25 executable/build/test inputs match current source after line-ending normalization. Documentation link/image and scoped credential-pattern checks passed. Package dry-run with a writable verification cache passed with 80 entries including the four added reports; no package was published. These checks do not close stock-host acceptance or independently establish the model used for every historical request. The candidate's later model-label confirmation is recorded above.
