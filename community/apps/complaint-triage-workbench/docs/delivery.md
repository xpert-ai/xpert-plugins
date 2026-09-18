# Delivery checklist

## Proposed source scope

Only `community/apps/complaint-triage-workbench/` and any necessary, separately reviewed community dependency metadata belong to the plugin PR. Implementation is committed at `4a115e6f398a1e6f16494c895ec0f8b0493293be`; follow-up changes are delivery documentation only. No root dependency changes were needed.

Include source, tests, build configuration/asset-copy script, package metadata, README, and acceptance/evidence documentation. Exclude `.env`, tokens, model credentials, `node_modules`, `dist`, private logs, temporary verification directories, and unrelated plugins.

The root `Complaint-Triage-Workbench-Development-Guide.md` is local guidance outside the plugin Git repository. Its reviewer-relevant requirements are summarized in the plugin README and acceptance record.

## Repository baseline and local prerequisites

- Xpert: `182f2f4a7d05d968016a9ec20a93833687c4394f`.
- Plugin baseline: `759e5a547d39f53dbafc7c58642936ebb104f121`.
- Branch: `feat/complaint-triage-workbench`.
- Fork remote: `https://github.com/Darlingair1/xpert-plugins.git`.
- Upstream/base: `https://github.com/xpert-ai/xpert-plugins.git`, `main`.
- Verified plugin implementation SHA: `4a115e6f398a1e6f16494c895ec0f8b0493293be`. Follow-up documentation commit(s) are identified by Git HEAD; do not substitute the upstream baseline or claim a self-referential final documentation SHA.

The local host includes Windows plugin/npm execution and model-provider compatibility changes. These are not part of the proposed plugin PR. The documented real-platform result used that modified local host; reproducing on an unmodified Windows host is not yet certified. Verify on a supported upstream environment or disclose/review the required host fixes separately.

## Fresh-install gate

Use a disposable copy of the community checkout without `.env`, `node_modules`, or `dist`; never reinstall the active workspace to test reproducibility. Respect community pnpm 8.15.8. Install dependencies and run the README commands there, then verify the built package's entry points, Assistant YAML, and remote JS/CSS. Inspect all newly generated dependency metadata before deciding whether it belongs in the PR. Do not commit a repository-wide lockfile change merely for this package.

Current single-package isolation check passed: after the dependency-only manifest correction and user installation, corrected isolated build, 27/27 tests and mock-backed lifecycle Harness passed. Earlier failures are preserved in clean-install.md. This closes the scoped dependency-isolation gate, not a fresh community-workspace/platform install or database/model business test. The upstream ChatKit/Core peer mismatch and pnpm workspace-root configuration scope remain disclosed; active dependencies were not changed.

Community-workspace Complaint verification passed in the tracked-source ZIP copy after user installation: filtered build, 27/27 tests, mock-backed Harness, entity-name scan and emitted asset checks. Earlier offline/approval failures remain recorded. pnpm still ignores nested packageExtensions; existing root dependencies satisfy the tested SDK/contracts import paths, so no root metadata change was needed. This is not a full-workspace build/test or unmodified-host business run. See [workspace-verification.md](workspace-verification.md).

Commands, resolved versions, input/lockfile hashes and Dockyard's existing dependency-remediation pattern are recorded in [clean-install.md](clean-install.md). The scoped single-package install/build/test/lifecycle check passed; this does not certify the entire community workspace, an unmodified host, or all upstream ChatKit paths.

The earlier active-workspace build used sibling Xpert TypeScript; the new isolated build used locally installed TypeScript without that fallback. Neither build result alone closes the test/load gate. Do not add undeclared links, alter registry security, or hide dependency failures.

## Evidence to attach

| Evidence | Minimum visible facts | Boundary |
| --- | --- | --- |
| Plugin | Name, 0.2.1, load result | A version badge alone is not runtime load proof; pair with host descriptor |
| Structured review | Result fields and review controls | User crop omits summary/reference; post-publish browser verified all seven fields separately |
| Human confirmation/reload | Reference, CONFIRMED, changed final result, original AI preserved | Post-publish browser replay passed; static images alone do not prove the preceding F5 |
| Failure | POST-PUBLISH-025, FAILED, readable error, Retry control | User-provided screenshot archived; no independent replay or Retry success for that case claimed |
| Retry | Same case ID/reference, count unchanged, attempt count 1 -> 2 | Final two-attempt state is supporting evidence, not the full transition trace |
| Ordinary chat | Points to workbench, no manual UUID request | New real-model reply passed after main prompt synchronization/publication |

Capture only fictitious business records. Crop account/email, authentication headers, unrelated Codex conversations, and private host identifiers. Cropping may remove private surroundings but must not alter business values or fabricate states. Record which evidence was provided by the user, observed live, or generated by mocks. See [screenshot provenance](evidence/README.md) and acceptance.md for P0 results.

The workspace-wide App storage scanner failed in unrelated Drawio/Story Studio files; the complaint UI scoped check passed. Do not include unrelated fixes in this delivery or describe the entire workspace check as passed.

## Final release gate

Current status update: the user pushed the Fork branch successfully, independently confirmed in GitHub comparison (two commits, 41 files, prior HEAD 3c9f6a8ed949b692dd1d21fdb88c4fe1b129daf4). Earlier credential/approval failures are historical. The prepared PR form is not an opened PR. This documentation follow-up does not alter executable inputs.

- [x] Published main prompt synchronized; new ordinary-chat behavior and post-publish normal business flow checked.
- [x] Single-package isolated install, build, tests, and mock-backed Harness completed.
- [x] Fresh community-workspace installation and Complaint-targeted build/tests/Harness verified.
- [ ] Unmodified-host validation completed or its limitation explicitly accepted by reviewer.
- [x] Available redacted screenshots and their provenance attached.
- [x] User-provided FAILED/error/Retry-control screenshot archived with evidence boundaries.
- [x] Final scoped source/credential-pattern/build-artifact review completed; latest dry-run package contains 76 files and excludes environment files/tests.
- [x] Corrected single-package isolated install/build, 27 tests and mock-backed Harness passed; broader workspace/platform installation is outside this result.
- [x] Lifecycle Harness rerun using repository instructions with host mocks; passed.
- [x] User authorized commit/push/PR; implementation commit SHA recorded and exact committed inputs rebuilt/tested with mock-backed Harness.
- [x] Prior Fork push completed and verified; any documentation follow-up must be pushed and verified separately.
- [x] README directly embeds the existing real screenshots; product, page wireframes, AI collaboration and source reuse are documented.
- [ ] Exact coding-model and business provider/model identifiers confirmed by candidate without exposing credentials.
- [ ] Stock-host verification completed or recruiter acceptance recorded; [preparation and user handoff](upstream-host-verification.md).
- [ ] PR created targeting upstream main; current form is prepared but not submitted.

No npm release, video, extra Skills PR, complex RBAC, multi-agent orchestration, RAG, or channel integration is required for this delivery.

See [submission review and demo runbook](submission-review.md) for source review, host boundaries, remaining gates, and the non-destructive interview sequence. Git submission remains a separately authorized operation.
