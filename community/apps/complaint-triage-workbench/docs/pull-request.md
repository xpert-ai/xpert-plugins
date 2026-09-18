# PR draft: Add Complaint Triage Workbench Agentic App

This is a local draft, not an opened PR. Release blockers below must not be removed without verification.

## Summary

Adds an independent Agentic App for customer-service specialists and complaint supervisors. Users create a persisted ComplaintCase, request real Assistant analysis, edit structured recommendations, and own final confirmation. Original AI, human draft, and human final results are stored separately.

## Implementation

- System/global plugin registration with `complaint_triage` artifact namespace.
- Organization-scoped App and Assistant template with middleware-only structured result Tool.
- Assistant Task runtime dispatch, task reconciliation, and TypeORM Case service.
- Workbench View and iframe Remote Component using the host data/action bridge.
- DRAFT -> PROCESSING -> PENDING_REVIEW -> CONFIRMED; failure -> FAILED -> Retry on the original case.
- Scoped conditional updates reject duplicate/stale results and invalid transitions; common credential-shaped errors are redacted.

## Verification

- Local build and asset copy: passed.
- Automated tests: 27 passed; repository-backed tests use in-memory doubles, not a real PostgreSQL integration suite.
- Lifecycle Harness: mock-backed lifecycle check; separate from plugin load and business flow.
- Host descriptor: 0.2.1, loaded, system:global.
- User-confirmed 0.2.1 workflow: create, AI review, human edit/confirm, refresh recovery, failure and original-case Retry without duplicate records.
- Live browser: RETRY-021 confirmed with two attempts, initially four cases. After synchronizing/publishing the main prompt, a new ordinary-chat reply passed without requesting manual identifiers. A separate fictitious POST-PUBLISH-021 regression passed real workbench AI writeback, human edit/save, draft reload, confirmation, final reload, and separate AI/human values; case count intentionally became five. No automated integration suite or independently replayed failure transition is claimed.
- Redacted screenshot evidence and provenance: docs/evidence/README.md.
- Supplemental user screenshot: POST-PUBLISH-025, FAILED, one attempt, total six, readable Copilot-plan error and Retry control. Distinct from earlier cases; no recovery for POST-PUBLISH-025 is claimed.
- Workspace-wide App storage scan: failed on unrelated Drawio/Story Studio files; complaint UI scoped check passed.

Exact commands, baselines, limitations, and evidence attribution are in README.md and docs/acceptance.md.

## Outstanding before submission

- Corrected single-package dependency-isolation verification passed: user installation, isolated build, 27/27 tests and mock-backed lifecycle Harness. Pre-correction failures are preserved. This is not a clean entire-workspace/platform install or new real-model/database test. Upstream ChatKit/Core peer compatibility and root pnpm extension scope remain disclosed. Evidence: docs/clean-install.md.
- Available screenshots include the supplemental FAILED/error/Retry-control image; static evidence does not prove every transition or recovery for POST-PUBLISH-025.
- Local host Windows compatibility changes must be disclosed separately, not included in this plugin PR.
- Fresh community ZIP-copy Complaint verification passed after user installation: filtered build, 27 tests, mock-backed lifecycle and asset checks. Nested pnpm settings are ignored, but existing root dependencies satisfy tested import paths without metadata changes. Workspace peer warnings and earlier failed attempts remain disclosed. Evidence: docs/workspace-verification.md.
- Unmodified-host behavior remains a separate verification gate; see docs/submission-review.md. Do not claim a build/test pass for all workspace packages or full upstream compatibility.
- Final source commit SHA and a verification of the exact committed source are required after authorized submission preparation. No implementation SHA exists yet.

## Scope and non-goals

No host-source changes, secrets, npm publication, channel integration, customer auto-send, RAG, multi-agent workflows, analytics, or complex RBAC. Model credentials and availability remain host prerequisites. No re-analysis after final confirmation or durable crash/timeout watchdog is provided.

## AI collaboration

AI assistance supported source reconnaissance, implementation, tests, and documentation. The evidence is the actual source/checks and attributed manual results; generated prose is not runtime proof. Repository/package license: AGPL-3.0.

## Target

Head: `Darlingair1/xpert-plugins`, `feat/complaint-triage-workbench`.
Base: `xpert-ai/xpert-plugins`, `main`.
No commit, push, or PR creation has been performed in this phase.
