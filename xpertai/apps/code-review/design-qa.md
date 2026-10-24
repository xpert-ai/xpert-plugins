# Code Review workbench — design QA

Final result: **passed** (2026-10-22).

## Selected reference and comparison

- User selected option 2, the three-pane review workbench.
- Reference: `/Users/xpertai05/tiwen/outputs/code-review-design-20261022/option-2-review-workbench.png` (1536 × 1024).
- Latest implementation: `/Users/xpertai05/tiwen/outputs/code-review-design-20261022/implemented-desktop.png` (1536 × 970).
- The reference includes a 54 px host tab strip. The iframe comparison excludes that host-owned strip; content widths are equal. The reference and implementation were inspected together, rather than comparing screenshots at unrelated zoom levels.
- Navigation and queue boundaries are approximately 214 px and 628 px at this width. One 49 px toolbar replaces the previous import/title/navigation bands. The host supplies semantic colors, font sizing and control density; the installed Assistant currently uses a coral accent.

## Intentional adaptations

- Preserve the host's compact typography and shared shadcn components. A larger PR title retains the heading hierarchy.
- Retain repository labels, viewed-file controls and the existing checks tab. One compact file selector replaces the duplicate file headings.
- Do not manufacture the three green Agent-completion badges in the generated reference: the detail DTO does not establish each Agent's completion. The real pipeline is available from its contextual action.
- Count authorized root records, not presumed executions: opening a PR, skipped webhooks and actual pipeline runs remain distinguishable. Child Agent reviews do not become duplicate queue rows.
- At narrow widths, collapse navigation by default and switch from the queue to detail after selection. Either pane can be reopened.

## Findings resolved

| Priority | Finding | Resolution and evidence |
| --- | --- | --- |
| P1 | Radix menu triggers could not obtain a DOM ref from the shared React 19-style Button while this plugin runs React 18. The menu remained positioned above the viewport. | Use native trigger buttons with the shared `buttonVariants` styling. Mouse and keyboard selection work in the Preview Host; Bosi also opens and cancels the PR dialog successfully. |
| P1 | Combining records could expose duplicates or historical private runs. | Apply existing ownership/project predicates before grouping; exclude child reviews. Actual PostgreSQL tests cover other users, tenants, organizations, Assistants and newly shared repositories with old private runs. |
| P1 | A run reason could disappear when its snapshot existed. | Show the run reason alongside the snapshot. The installed PR #1188 displays its pre-existing GitHub App reference-change notice. |
| P2 | An unlayered universal border rule overrode component borders. | Move the fallback into the base layer; verify button, selection, card and input boundaries. |
| P2 | Medium-width navigation appeared collapsible but could not expand. | Initialize the compact state from viewport width and keep explicit expansion usable. |
| P2 | Duplicate file headings and flat title hierarchy consumed vertical space. | Use one file toolbar and a stronger PR title. |

No unresolved P0/P1/P2 visual or interaction findings in the checked states.

## Interaction and responsive evidence

The Preview Host serves the production `dist` bundle, with synthetic records only. Checked search/empty results, repository/status controls, pinned records, skipped-event reasons, version history, viewed-file mutation, new-PR URL validation and successful opening, saved-pipeline selection/start, local Git import dialog, repository/settings navigation, navigation collapse and queue collapse. Recorded client commands carry the Project, pipeline instance and round IDs.

- Desktop Chinese: `implemented-desktop.png`.
- Narrow 600 × 800 detail: `implemented-narrow.png`.
- English dark theme: `implemented-dark-en.png`.
- Fixture mutations and navigation commands: `preview-verification.json`.
- Main preview console: no warnings/errors in the inspected final session. The browser inspection session reported an unattributed MutationObserver error while attaching the separate dark tab; its rendered controls, content and theme were checked successfully. This is not treated as evidence of a failure in the review workflow.

All evidence paths above are under `/Users/xpertai05/tiwen/outputs/code-review-design-20261022/`.

## Installed acceptance

Loaded the build through the existing local-plugin refresh UI, restarted the API and refreshed Bosi. `installed-build.json` records HTTP 200 health and matching SHA-256 hashes for the runtime JavaScript, CSS and workbench query module.

In the logged-in Bosi application:

- The real queue shows 16 PR groups, including manual reviews and webhook runs.
- PR #1188 groups six root records and renders the fixed `1cb5b527aeb3…` snapshot.
- Selecting the prior `c5f937b7b9bd…` history entry changes the selected version; returning restores the current run.
- **Open approval** opens the existing Project Tasks view for this PR, with its pending `approve` node, inside Bosi.
- **New review → Open GitHub PR** opens the real dialog and can be cancelled.
- Screenshot: `bosi-workbench.png`. No approval or GitHub publication was performed for this UI acceptance.

The existing run's GitHub App reference-change notice still requires repository-rule revalidation before publication. Plugin configuration and authorization were not changed as part of the layout work.

## Engineering checks

- 71 tests passed, including real PostgreSQL tests in an isolated schema of the dedicated test database; none skipped. Output: `tests-workbench.log`.
- TypeScript backend/remote typechecks, build and generated-asset freshness check passed.
- Plugin metadata check and dist-first lifecycle harness passed.
- `git diff --check` passed.
- The repository's Nx graph is blocked by three unrelated unnamed projects; the package's own build/typecheck scripts were used successfully. Existing worktree changes were preserved; no commit or push was made.

## Follow-up: resizable PR list (2026-10-22)

- Added a 6 px draggable separator. Keyboard arrows adjust by 24 px, Home/End select the bounds, Escape cancels a drag, and double-click resets the default.
- The list header also offers narrow/medium/wide/reset choices so dragging is not required. Width stays in view-local React state; no Web Storage or business-data mutation is used.
- Width is bounded to 240–640 px and reserves 360 px for details when the desktop viewport permits. Shrinking the window clamps the displayed width while retaining the preferred width. Below 760 px the separator/menu are hidden and selection switches to detail.
- Production Preview Host: pointer drag 400 → 500 px, Home 240 px, End 640 px, menu 560 px; a 900 px host clamps to 380 px. At 600 px, content width equals viewport width and selecting a PR opens detail.
- Installed Bosi: native pointer drag changed the separator's accessible value from 389 → 489 px. Runtime JavaScript/CSS hashes match the local build. Evidence: `resizable-workbench.png`, `bosi-resizable-list.png` in the output directory above.
- Backend/remote typecheck, build, freshness, metadata, lifecycle harness and three workbench contract tests passed for this follow-up. The prior 71-test backend run remains the coverage baseline; this follow-up changes only layout.

## Follow-up: direct pipeline template setup (2026-10-22)

- Manual PR startup and repository rules share the template/Assistant/parameter form. Saved configurations remain an optional reuse path; the configuration is created only when the user submits startup or confirms repository saving.
- Production Preview Host from the `xpert` checkout verified an empty configuration list, standard/lightweight source filtering, role counts, parameter editing, configuration-before-start ordering, repository saving, and cancellation without changing an existing repository binding.
- Installed acceptance ran entirely from `xpert`: API 3000, Cloud 4200 and Bosi 4390. After the user authorized copying the prior environment configuration, existing database data and sessions were retained. No platform source changes were made in `xpert-pro`.
- Created `Code Review 模板验收 20261022` with the Code Review project type. With no pre-saved configurations, the real manual dialog offered the standard template with three Assistant roles and the lightweight template with one role.
- Opened the real test PR `xpert-ai/xpert#1188`, fixed head `87ae3b494140…`, selected lightweight review and started successfully. Preparation, CI and the review Agent completed. The instance stopped at the human `approve` node; no approval or GitHub publication was performed.
- Saved the standard template directly in the `xpert-ai/xpert-plugins` repository rules. The repository moved from policy revision 1 to 2 and stayed paused. Reopening the rules retained its current pipeline binding. The active `xpert-ai/xpert` repository policy was left at revision 4.
- Rebuilt the platform's remote components to include the new `projectTypes` contract, then restarted the `xpert` API and remounted Project Tasks. This resolved the old view bundle's `unrecognized_keys: projectTypes` error. The live flow now renders correctly and supports fit-to-view.
- Validation: plugin typecheck, build, dist freshness, metadata and lifecycle harness passed; 51 plugin tests passed and 4 database tests were skipped. The plugin test/lifecycle run used the companion `xpert` contracts build through an external validation-only loader because the published 3.25 dependency does not include the new project-type contract. No dependency lockfile was changed for this validation.
- Platform validation: 286 contract tests, 35 focused project-type/configuration tests, 16 pipeline catalog tests and 2 preview-host tests passed. The new remote-component build and both repository whitespace checks passed.
- Evidence under `/Users/xpertai05/tiwen/outputs/code-review-template-setup-20261022/`: `bosi-template-standard.png`, `bosi-template-light.png`, `bosi-repository-saved.png`, `bosi-pipeline-awaiting-approval.png`, `installed-hashes.json`, `xpert-runtime.json` and test logs. This acceptance used a real PR through manual startup; it did not generate another webhook event.
