# Code Review + Sites implementation acceptance

Date: 2026-10-12. Core-flow acceptance: passed. Branch: `feat/code-review-sites`.

## Implemented

Both applications install through plugin App contributions, initialize a dedicated workspace and an Assistant, and use the organization's existing model. Shadcn UI is the repository-local `packages/shadcn-ui` package; Tailwind v4 and the host theme bridge style both remote views. The existing left conversation is retained. Plugin content occupies only the right Workbench view beneath host tabs.

**Code Review**: public GitHub PR loading; connected-account inbox/private-repository support; fixed-commit diffs, checks and discussions; viewed-file and pin state; background model review, execution binding and cancellation; validated inline findings; explicit GitHub review confirmation with a fresh-head check and an uncertain-write retry guard. Drafts are scoped by tenant, organization, user and Assistant. It does not execute repository text as instructions.

**Sites**: searchable library and real rendered thumbnails; create in a Dialog, send work to the existing conversation, inspect and revise the selected project; immutable saved source/assets; desktop/mobile preview; version history and restoration to a new draft; confirmed publishing with Artifact access policy; private/public/workspace/custom audience support and revocation. Saved drafts do not silently change the published version. The preview uses sandbox + CSP isolation and no platform credentials.

**ChatKit host fix**: successful plugin navigation now uses the existing host navigation persistence mechanism, restoring selection and parameters after remount/reload. State is held by ChatKit, not opaque plugin iframe storage. Its commands and project-navigation suites isolate session history between tests.

## Worktrees and runtime

- xpert-plugins base: `c15c39cc7745ad217890c081f63748d52c482c76`.
- xpert base: `ea64996a7b8cc8ebc76413650c561efaf05c374b`; host now includes bounded signed JSON capture and a native workspace connector client command for automatic review setup.
- chatkit-js base: `195c5de` (latest fetched develop when the host fix began).
- Xpert API and UI run from their worktree on 3000 and 4200. The existing database, Redis, account and Qwen model configuration are reused. ChatKit's worktree production `dist/app` is staged into the platform worktree's local dependency asset directory and served at `/chatkit`; no original checkout dependency assets were changed.
- Platform/ChatKit: Node 22.22.2, package-manager pins honored. Plugin build: Node 24.14.1 / pnpm 11.15.1. Lifecycle harness: Node 20.20.2.

## Passed checks

- Nx `typecheck`, `build`, `test` for both plugin packages; both `verify:dist` freshness checks.
- Five Code Review tests: URL/diff validation, scope and execution binding, stale-head rejection, uncertain submission retry protection. Sites tests cover scoped reads, static bundle resources, encrypted secret requirements, pinned artifacts, publishing confirmation and restore semantics.
- `plugin-dev-harness` loaded and closed both packages using each package directory as the workspace.
- ChatKit worktree production build, TypeScript check, and all Workbench tests: **54 files / 369 tests passed**.
- Generated-assets representative host: Sites publish cancel, denied action and recovery, selected-tab reload and scope update; Code Review diff finding, viewed state, selected-tab reload and cancelled submission. Both receipts contain zero uncaught errors.
- Real platform: installed and initialized both apps; normal template update preserved existing Assistant identities, then published v2 through Studio.
- Real Code Review: public `xpert-ai/xpert-plugins#725`, head `c15c39cc7745ad217890c081f63748d52c482c76`; model task completed with a persisted draft. The focused review had a 12-evidence-call budget, returned zero structured findings and documented its coverage limits. Reload recovered the selected PR and tab.
- Real Sites: created Studio, model generated HTML, saved v1, interactive preview and mobile width; private publication worked. Restore created v2 without changing published v1. A natural-language edit resolved the selected project without a supplied ID, saved v3, and automatically updated the preview; publication remained v1.
- Responsive acceptance: desktop split view, 390 px preview, and 1000 px host viewport with accessible drawer controls; viewport override restored.
- Runtime provenance: authenticated remote entries exactly contain the generated plugin JS/CSS; served ChatKit asset bytes equal the worktree production bundle.
- Published Artifact: authenticated descriptor/content HTTP 200; anonymous descriptor HTTP 404; normal browser authentication rendered the private page and the interaction button changed state.

## Scope and unverified paths

This is a working static Sites implementation, not complete Codex Sites hosting parity. It does not provide D1/R2, server routes, custom domains, hosted user auth or real traffic analytics. Static pages have no browser storage or network API access. Environment records are metadata and are not injected into static pages.

No real GitHub comment or review was posted. Private-repository inbox and external GitHub writes still require acceptance with a connected account; their important guard paths are covered in focused tests. Public-link exposure, custom-audience grants and destructive archive/revoke were not applied to the real acceptance project. Tests do not establish remote CI or production readiness for every host configuration.

Evidence screenshots and secret-free receipts are retained in the task's local environment evidence directory; secrets, auth tokens and raw startup logs are not included in this repository.

The initial generation conversation contains a host file-change-capture warning. Saved site content and published bytes were independently verified; the subsequent edit recorded its file changes normally.


## Automatic PR review follow-up (2026-10-12)

Implemented repository policies, GitHub App installation credentials, signed PR webhook routing, delivery/operation deduplication, a Managed Queue supervisor, persisted quota and execution identities, draft confirmation and COMMENT-only automatic publication of P0/P1 inline findings. The right-panel UI now has Inbox, Repositories and Settings, with native account connection, trial review, trigger/path/branch rules, daily cap, pause, retry and process navigation. Manual public/connected PR loading and recent/requested/authored lists remain available.

Verification for this follow-up:

- Code Review Nx build/typecheck and **9 unit tests** passed; generated asset verification passed.
- **15 PostgreSQL integration scenarios** passed in an isolated disposable schema: parallel delivery/worker deduplication, scope ownership, finalizer binding, draft confirmation, P0/P1 filtering, head supersession, publication once, uncertain-POST freezing, pause cancellation, quotas, debounce, new retry attempts, private inbox, non-publishing trials and bootstrap recovery. GitHub, model and queue transports are fixtures in this test.
- **2 host raw-body tests** passed; full cloud TypeScript checking passed.
- Code Review and GitHub Connector lifecycle harness passed. The connector's runtime dependency uses the published `^0.1.0` version instead of an unresolvable `workspace:` protocol during host staging; installation and definition discovery succeeded.
- Installed host API: automation overview returns HTTP 200 with App setup required; the GitHub definition is available; the anonymous webhook reaches the signature guard and returns `401 invalid_webhook_signature`.
- Installed browser: Inbox/Repositories/Settings render; Connect GitHub opens the native OAuth/token dialog, and cancellation returns cleanly. No account was authorized.
- The actual public PR `xpert-ai/xpert#1125` at `82d7b43ba643f35bcea19e107fd84ba51f1e9e8d` was loaded through the UI and reviewed using the existing model. The 6-evidence-call focused acceptance saved a private result with zero findings and explicit coverage limits, without a GitHub submission.
- Representative generated-assets host: rule confirmation cancellation caused no mutation; confirmation saved policy revision 2; a denied publication displayed an error, retained the pending result and closed its modal. No uncaught errors occurred.
- Final service restart: Code Review and Sites remote JS/CSS match their generated worktree assets, and served ChatKit bytes match its worktree build. The review-process button opens the completed model conversation without a spurious context-change error. The final screenshot preserves the left conversation and right plugin view; temporary viewport overrides and the fixture server were cleaned up.

Actual GitHub App configuration, private repository authority, Internet webhook delivery, and real bot publication remain intentionally unverified until the user configures authorization. The local tests do not establish these external outcomes. No public tunnel or real credentials were created.

## Four review findings: regression acceptance (2026-10-12)

Fixed all four findings in the existing plugin worktree:

- Automatic review continues reconciling drafts awaiting confirmation. Changed heads, closed PRs and changed policies invalidate stale drafts; interrupted or uncertain GitHub submissions are reconciled before invalidation and cannot be posted twice. Confirmation commits these state changes even when returning an error. Worker rotation prevents a full batch of waiting drafts from starving queued work.
- Sites preserves the global scope of classic external scripts when inlining them, so HTML event handlers and subsequent scripts can call their functions. Module scripts retain their existing bundling behavior.
- Sites respects an explicitly cleared host selection, clears its assistant context, and ignores delayed detail responses. Context-only updates retain the host's existing selection.
- Local stylesheets are inlined in their original document position with media and other applicable attributes preserved, retaining the CSS cascade.

Verification on the final implementation:

- Both packages passed Nx build, typecheck and tests: **9 Code Review unit tests**, existing Sites artifact assertions, and **4 new Sites rendering/navigation regression tests**.
- Automatic review passed **21 PostgreSQL integration scenarios** (the previous 15 plus 6 regression scenarios) in a disposable schema. The schema was removed afterward; GitHub, model and queue transports remained fixtures.
- Both plugin lifecycle harness checks and deployment freshness checks passed. Both installed remote entries contain the exact generated worktree JS/CSS.
- Restarted the worktree API on port 3000; API and worktree UI on port 4200 both returned HTTP 200. Existing database, account and model configuration were reused.
- In the installed browser, Sites detail → list → Back → Forward → reload restores the correct list/detail state. Code Review's installed inbox renders after the API restart.
- A real-browser page built with the Sites bundler verified cross-script global function calls, HTML button interaction, the expected blue cascade result, and preservation of a print-only stylesheet.

Screenshots and the secret-free receipt are saved locally as `four-fixes-acceptance.json` and `evidence/four-fixes-*.png`. The temporary rendering fixture server was stopped. Real GitHub authorization, webhook delivery and bot publication remain outside this local acceptance, as requested.
