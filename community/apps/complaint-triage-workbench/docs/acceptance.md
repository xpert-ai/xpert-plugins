# Acceptance and delivery record

Updated: 2026-09-18 (Asia/Shanghai). Local hardening revision: `0.2.1`, uncommitted.

## Evidence boundaries

- Xpert HEAD: `182f2f4a7d05d968016a9ec20a93833687c4394f`; local Windows compatibility changes remain outside the plugin delivery.
- Plugin branch: `feat/complaint-triage-workbench`; HEAD/upstream-main baseline: `759e5a547d39f53dbafc7c58642936ebb104f121`. This baseline does not identify the uncommitted plugin source.
- This revision: build passed, 27 automated tests passed. Lifecycle and source audit results are recorded separately below.
- `0.2.1`: the user confirmed the normal workflow, human edits/confirmation, refresh recovery, and failure/Retry on the original case. A read-only host descriptor check returned `currentVersion: 0.2.1`, `loadStatus: loaded`, `scopeKey: system:global`.
- Initial live browser inspection showed four cases, including confirmed `REGRESSION-021` and confirmed `RETRY-021` with two analysis attempts. This supports the Retry final state, not an independently replayed failure or PostgreSQL integration test.
- The initial ordinary-chat check requested `caseId` and `attemptId`. The existing Assistant's main prompt was then synchronized in the host editor and published as v1 on 2026-09-18 at 13:28 (Asia/Shanghai), retaining its identity, model, middleware, and Workbench. A new real-model conversation passed: workbench guidance, automatic identifiers, and human-only final confirmation. This chat check did not create a complaint.
- A separate post-publication browser regression created the fictitious `POST-PUBLISH-021` at 13:35. Workbench AI analysis returned all seven structured fields and entered PENDING_REVIEW at 13:36. The operator changed only the human summary, saved at 13:37, refreshed and verified the draft, confirmed at 13:38, then refreshed and verified CONFIRMED, the revised final summary, and the unchanged AI original. Four -> five cases is an intentional new test case, not Retry duplication. Existing cases were preserved.
- Prior Remote View Preview/mobile checks were mock-backed UI evidence, not real AI or persistence acceptance.
- User-provided screenshot `133906b1` subsequently showed POST-PUBLISH-025 at 13:52: FAILED, one attempt, total six, error code `assistant_task_failed`, message "当前会员计划无法使用该 Copilot 模型。", and Retry control. This closes the failure-state screenshot gap, not a fresh independent replay or proof of Retry success for that case. It is distinct from POST-PUBLISH-021 and RETRY-021; do not join these images into one case's transitions.

## P0 matrix

| # | Acceptance fact | Automated layer | Real-platform status |
| --- | --- | --- | --- |
| 1 | Create ComplaintCase | Service unit test | User confirmed; post-publish browser regression also passed, 0.2.1 |
| 2 | Required field validation | Schema/service/View unit tests | User confirmed earlier, 0.2.0; new View checks automated |
| 3 | Trigger real AI | Dispatch mocked; no real LLM automated test | User confirmed; post-publish workbench invocation also passed, 0.2.1 |
| 4 | Structured AI result | Schema, result writeback unit test | User confirmed; post-publish browser observed all seven fields, 0.2.1 |
| 5 | Enter PENDING_REVIEW | Service unit test | User confirmed; post-publish browser regression also passed, 0.2.1 |
| 6 | View/edit/save result | Service/View unit and built UI checks | User confirmed; post-publish human-summary edit/save/reload also passed, 0.2.1 |
| 7 | Human confirmation | Service unit test | User confirmed; post-publish browser confirmation also passed, 0.2.1 |
| 8 | Persist CONFIRMED | In-memory repository unit test only | User confirmed; post-publish browser confirmed final state after reload, 0.2.1 |
| 9 | Refresh page | Prior mock UI preview only | User confirmed; post-publish browser reloaded draft and final state, 0.2.1 |
| 10 | Recover same case/result | Scoped repository reload unit test | User confirmed; post-publish browser verified reference, status, AI original and human summary, 0.2.1 |
| 11 | Model failure becomes FAILED | Task start/status failure unit tests | User confirmed disabled Primary failure, 0.2.1; separate POST-PUBLISH-025 screenshot shows FAILED after host task failure |
| 12 | Readable failure | View error and redaction unit tests | User confirmed; POST-PUBLISH-025 screenshot shows readable Copilot-plan error and Retry control; synthetic-key live filtering not separately checked |
| 13 | Retry original case | Service/task dispatch unit tests | User confirmed, 0.2.1 |
| 14 | Retry creates no duplicate | Concurrent/stale-attempt unit tests | User confirmed same case/count, attempt 1 -> 2; live UI shows RETRY-021, two attempts |
| 15 | Retry succeeds into PENDING_REVIEW | Service unit test | User confirmed, 0.2.1 |
| 16 | Plugin build | TypeScript + asset copy | Passed in active and isolated dependency environments, 0.2.1 |
| 17 | Plugin lifecycle | Mock-backed Harness | Active-workspace and corrected isolated Harness passed, 0.2.1; pre-correction import failure preserved, not business acceptance |
| 18 | Real platform business workflow | No automated end-to-end suite | User confirmed normal and Retry flows; post-publish normal flow also exercised through the real browser, 0.2.1 |

## Additional regression coverage

- Cross-tenant reads/writes blocked; cross-organization result/failure/review/confirmation writes blocked.
- Missing tenant or authenticated creator rejected.
- Only one concurrent analyze/Retry transition succeeds; one business record remains.
- Invalid result, duplicate Tool write, stale attempt, repeated confirmation, and edits after confirmation rejected.
- Original AI recommendation is preserved separately from human edits and final result.
- Task start errors, failed/interrupted status errors, ordinary View errors, and asynchronous probe errors are redacted in tested formats.
- Internal Agent middleware Tool remains registered without an external MCP write endpoint.
- Whitespace-only mandatory fields, scope injection in View input, and invalid View create input rejected; empty table has no nonexistent selection.
- HTTP exception response messages are redacted and capped at 500 characters.

These are in-memory/static tests, not proof of PostgreSQL concurrency, complex RBAC, actual model prompt compliance, or arbitrary secret-format detection.

## Package and source audit

On 2026-09-18, `npm pack --dry-run --json --ignore-scripts` passed for `0.2.1`: 74 files, including JS/type exports, UI assets, Assistant YAML, README, and acceptance/evidence documentation. Earlier 62/72/73-file results preceded added documentation/screenshots, the supplemental failure image, and the isolated-install report respectively. No tarball was generated or published. No environment file or test fixture is included.

After adding submission-review.md and workspace-verification.md, the latest dry-run passed with 76 files. Both reports and runtime entry/YAML/UI JS/CSS were explicitly checked; environment/dependency/test paths were excluded. This is package-content validation, not an install/load test.

Scoped source/docs scanning found zero trailing-whitespace issues and zero JWT/long `sk-` credential-shaped matches. Build files contained no absolute developer paths. `community/.env` and plugin `dist` are Git-ignored; `.env` is not tracked. `git diff --check` cannot cover this untracked plugin, so its whitespace was checked separately. These checks are not a comprehensive secrets/security audit.

The workspace-wide `node scripts/check-app-view-storage.mjs` check failed on unrelated `xpertai/apps/drawio/src/lib/artifact-viewer/viewer-static.min.js` and `xpertai/apps/story-studio/src/lib/remote-components/story-studio-workbench/src/studio-panel-layout.tsx`. This is not an overall workspace pass. The complaint UI scoped source/asset check passed; those unrelated files were not modified.

## Screenshots

Redacted screenshots and attribution are in [evidence/README.md](evidence/README.md): plugin version, structured review controls, Retry final state, ordinary chat, post-publish pending/confirmed/reloaded human results, and the supplemental [POST-PUBLISH-025 failure image](evidence/failure-post-publish-025.png). Static screenshots support visible facts; they do not independently prove all preceding transitions or Retry success for POST-PUBLISH-025.

## Remaining verification

1. Preserve the verified published prompt/model/middleware/Workbench. Ordinary chat and the post-publish normal business flow have now passed separately.
2. Failure-state screenshot received and archived. If POST-PUBLISH-025 recovery is subsequently tested, record the same case reference and unchanged count separately; do not use RETRY-021's final state as its recovery proof. Existing user-confirmed Retry acceptance remains separately attributed.
3. Verify live error filtering with safe synthetic credential-shaped text if needed; never use an actual credential. Automated filtering tests already cover common formats.
4. Corrected single-package isolated dependency verification completed: user installation, own-compiler build, 27/27 tests and mock-backed Harness passed. Earlier dependency import failures remain recorded. No fresh entire-workspace/platform installation or new database/model business test is claimed. Upstream ChatKit/Core peers and workspace-root pnpm extension scope remain disclosed. See [clean-install.md](clean-install.md).
5. Fresh community-workspace Complaint verification passed after user installation: filtered build, 27 tests, mock-backed Harness and source/asset checks. Nested pnpm settings are still ignored, but current root dependencies satisfy tested import paths without metadata changes. Earlier offline/approval failures remain historical evidence; not all workspace packages or an unmodified host were verified. See [workspace-verification.md](workspace-verification.md).

## Delivery checklist

- [x] Plugin source, readable architecture/workflow documentation, AI assistance disclosure, limitations, baseline SHAs.
- [x] Build, automated test, lifecycle Harness, Entity naming results kept separate.
- [x] User-confirmed real workflow and failure/Retry results attributed explicitly.
- [x] New revision loaded and business regression user-confirmed; final states additionally inspected in the live browser.
- [x] Ordinary-chat prompt synchronized/published; new real-model reply and post-publish workbench analysis verified.
- [x] Available redacted acceptance screenshots attached with provenance; values were not fabricated or altered.
- [x] User-provided FAILED/error/Retry-control screenshot added with provenance and same-case evidence limits.
- [x] Single-package isolated installation, dependency versions and disposable lockfile hashes recorded; build, 27 tests and mock-backed Harness passed.
- [x] Fresh community-workspace installation and Complaint-targeted build/tests/mock-backed Harness verified.
- [ ] Unmodified-host reproducibility verified or its limitation explicitly accepted.
- [x] Separate local host Windows fixes documented; no host-source modifications made this phase or included in the proposed plugin scope.
- [x] Final scoped source/whitespace/credential-pattern/artifact review completed; latest candidate scan covers 33 text files. Not a comprehensive security review.
- [ ] User-authorized commit/push/upstream-main PR; final implementation SHA recorded.

Video and npm publication are not required by the current delivery plan. No Git history or remote state was changed in this phase.
