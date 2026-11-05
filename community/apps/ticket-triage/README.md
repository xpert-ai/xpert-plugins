# Ticket triage board (`@community/apps-ticket-triage`)

A Xpert business application for the support shift lead: the assistant reads the ticket backlog and
proposes a priority, an owning team, a rationale and a draft reply. **A human confirms every ticket
in the workbench board** — nothing is closed by the model.

* Target user: the support shift lead who owns the queue.
* Core flow: open board → load backlog → ask the assistant to triage one ticket → review the
  proposal → confirm / reject / retry → the decision is persisted and survives a reload.
* AI step: two tools exposed through an Agent middleware (`list_pending_tickets`,
  `propose_ticket_triage`) called by a real model at runtime.
* Product surface: an Assistant template plus a workbench view (`ticket_triage.board-view`),
  served as a self-contained remote component.

## What it is not

* Not a chat-only app: the board is the product surface and state lives in the plugin's own table.
* It does not auto-close tickets, send replies, or call any external system.
* It is not a wrapper around one third-party API.

## Reading order for reviewers

Each document opens with a 30-second summary, then the evidence, then an appendix with the plumbing:

| # | Document | Read it for |
| --- | --- | --- |
| 1 | [Product and scope](docs/interview/01-product.md) | the user, the flow, the two screen wireframes, the trade-offs |
| 2 | [Run it](docs/interview/02-runbook.md) | five steps from clone to a confirmed ticket, plus the pitfalls |
| 3 | [Validation](docs/interview/03-validation.md) | four layers with commands and results, five acceptance scenarios, known limits |
| 4 | [AI collaboration](docs/interview/04-ai-collaboration.md) | what the agent did, what the human did, and the one isolation experiment |
| 5 | [Sources and licence](docs/interview/05-sources.md) | pinned commits, reused skeleton vs. own code (AGPL-3.0) |
| 6 | [Gaps and the PR](docs/interview/06-gaps-and-pr.md) | limits graded by "does it affect the demo" |
| 7 | [Interview notes](docs/interview/07-interview-notes.md) | walkthrough script, 10 follow-ups, numbers (not a deliverable) |

## Workspace layout

```
src/index.ts                     plugin metadata, marketplace app, templates, register()
src/lib/constants.ts             provider / view / middleware / action keys
src/lib/ticket.entity.ts         plugin artifact table, unique (scope, ticketCode)
src/lib/ticket.service.ts        domain: board, seed, propose, confirm, reject, reset, markFailed
src/lib/triage.middleware.ts     Agent middleware: the two model-facing tools
src/lib/board-view.provider.ts   workbench view: manifests, data, actions, remote entry
src/lib/templates.ts             Assistant template contribution
src/ticket-triage-assistant.yaml Assistant DSL (agent node + middleware node + connection)
src/lib/remote/                  remote component: bridge, UI, HTML shell
scripts/build-remote.mjs         bundles the UI into one self-contained HTML file
tests/domain.test.ts             domain tests (state machine, conflicts, isolation)
```

## Build and test

```bash
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run test
corepack pnpm run build      # dist/index.js + dist/remote/ticket-triage.html + dist/*.yaml
corepack pnpm run verify:dist
```

Plugin loading check (from the plugin repository root, Node 20):

```bash
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-ticket-triage
```

## Run it on a local Xpert

Prerequisites: Xpert running locally, a model provider configured, and a user allowed to install
tenant-level plugins (see `community/README.md`).

```bash
# 1. build the plugin
cd community/apps/ticket-triage && corepack pnpm run build

# 2. deploy it into the running API (run from the Xpert host repository root)
corepack pnpm plugin:deploy:local \
  --plugin-dir /abs/path/to/xpert-plugins/community/apps/ticket-triage \
  --api-url http://localhost:3000 \
  --token "$XPERT_TOKEN" \
  --org-id "$XPERT_ORG_ID"
```

`plugin:deploy:local` requires authentication (`--token`, a stored credential, or `--username` /
`--password`); without it only `--dry-run` works. The command prints `restartRequired` when the API
must be restarted before the plugin becomes active.

### Environment variables

Copy the example and fill in your own values. No credential is committed to this repository.

```bash
# deploy.env.example
XPERT_API_URL=http://localhost:3000
XPERT_TOKEN=                      # JWT of a user allowed to install tenant plugins
XPERT_ORG_ID=                     # organization id used for the install
```

The assistant needs a model configuration inside Xpert (Settings → Model providers). The plugin
never stores or reads a model key of its own.

## Using it

1. Install the plugin; restart the API when the command reports `restartRequired`.
2. Create an assistant from the template **Support ticket triage**.
3. Open the assistant workbench → **Ticket triage** view.
4. Press **载入演示工单 / Load demo tickets** to create four demo tickets.
5. Ask the assistant: `给最早的一张待处理工单做分诊。` It calls the tools and proposes a triage.
6. The board shows the proposal. Press **确认分诊 / Confirm**, or **退回重做 / Reject**.
7. Reload the page: the decision is still there (persisted in the plugin table).

### Failure and retry

* Ask the assistant to triage a ticket another session already confirmed: the tool returns
  `invalid_state` and the assistant moves on instead of retrying blindly.
* A proposal written with a stale board revision returns `conflict`; the view tells you to refresh,
  and the rejected write never bumps the row revision.
* A ticket in `failed` state can be retried from the board: it returns to `pending` in place, so a
  retry never creates a second ticket record.

## Deliverables

| Deliverable | Where |
| --- | --- |
| Product description | [docs/interview/01-product.md](docs/interview/01-product.md) |
| Source code | `src/`, `scripts/`, `tests/` |
| Runbook (incl. env example) | [docs/interview/02-runbook.md](docs/interview/02-runbook.md), [docs/interview/deploy.env.example](docs/interview/deploy.env.example) |
| Validation results | [docs/interview/03-validation.md](docs/interview/03-validation.md) |
| Sanitized evidence | [docs/interview/evidence.json](docs/interview/evidence.json) |
| AI collaboration notes | [docs/interview/04-ai-collaboration.md](docs/interview/04-ai-collaboration.md) |
| Sources | [docs/interview/05-sources.md](docs/interview/05-sources.md) |
| Known limits + PR plan | [docs/interview/06-gaps-and-pr.md](docs/interview/06-gaps-and-pr.md) |
| Interview notes (not a deliverable, kept for the walkthrough) | [docs/interview/07-interview-notes.md](docs/interview/07-interview-notes.md) |

## Screenshots

Captured from a production build of the Cloud UI (`nx build cloud --configuration=production`) served
locally, against a real Xpert API with real Postgres, a real model call and a real confirmation click.

| Screenshot | What it proves |
| --- | --- |
| [01-workspace-assistant.png](docs/interview/screenshots/01-workspace-assistant.png) | The plugin's marketplace app installed into a workspace, assistant published as v1 |
| [02-agent-canvas.png](docs/interview/screenshots/02-agent-canvas.png) | The assistant template created an agent that carries the Triage middleware and its two tools |
| [03-preview-composer.png](docs/interview/screenshots/03-preview-composer.png) | The studio preview composer used for the live run |
| [04-preview-prompt.png](docs/interview/screenshots/04-preview-prompt.png) | The exact prompt that drives one ticket through triage |
| [05-chat-tool-calls.png](docs/interview/screenshots/05-chat-tool-calls.png) | Real model turn: `list_pending_tickets` returns the backlog, `propose_ticket_triage` records P1/product for T-1004 |
| [06-board-awaiting-human.png](docs/interview/screenshots/06-board-awaiting-human.png) | The workbench view rendering live data: one proposal waiting for a human, one already confirmed |
| [07-board-confirmed.png](docs/interview/screenshots/07-board-confirmed.png) | The human confirmation click: `confirm_triage` succeeds with `revision 3`, counters move to 待确认 0 / 已确认 2 |
| [08-middleware-capabilities.png](docs/interview/screenshots/08-middleware-capabilities.png) | The middleware as the platform sees it: two tools and the `ticket_triage.board` view capability |
| [09-board-persisted-after-restart.png](docs/interview/screenshots/09-board-persisted-after-restart.png) | Saved-and-restored: the same four records with their revisions after an API restart |
| [10-board-empty-state.png](docs/interview/screenshots/10-board-empty-state.png) | Empty state: an explicit hint and the "load demo tickets" entry point, not a blank page |
| [11-board-needs-retry.png](docs/interview/screenshots/11-board-needs-retry.png) | Failure surface: `需重试` with the attempt count, the failure code (`model_timeout`) and a retry button |
| [12-board-retry-recovered.png](docs/interview/screenshots/12-board-retry-recovered.png) | Retry: the same row goes back to `待处理` (attempt count kept, still four rows - no duplicate ticket) |
| [13-platform-shell-board.png](docs/interview/screenshots/13-platform-shell-board.png) | The **platform's own workbench shell** (`/chat/...`, app-platform managed mode): the plugin's view opened as the `工单分诊` tab, live data from the view-host API |
| [14-platform-shell-confirmed.png](docs/interview/screenshots/14-platform-shell-confirmed.png) | Human confirmation inside that same platform shell: `confirm_triage` succeeds, counters move to 待处理 3 / 已确认 1 |

Screenshots are regenerated by `tests/browser/capture-chat.mjs` and `tests/browser/capture-board.mjs`;
see [tests/browser/README.md](tests/browser/README.md) for the commands and for the two SQL statements
that create the empty and failed states.

### Which shell is which

13 and 14 are the real platform shell: app platform configured (`APP_PLATFORM_FILE` /
`APP_PLATFORM_ENVIRONMENT_FILE`), the delivery provisioned, then
`/chat/x/community-apps-ticket-triage-studio-<org>/c?view=ticket_triage.board__ticket_triage.board-view`.
That path needs two things this repository cannot ship: a membership plan row (`membership_plan`, plus the
`FEATURE_MEMBERSHIP_PLAN` feature toggle) and the platform actor's role carrying the usual permissions.
Without them the delivery fails with `application_trial_unavailable` / `application_preparation_failed`.
The exact SQL and the observed failure codes are recorded in
[docs/interview/03-validation.md](docs/interview/03-validation.md).

06, 07, 09, 10, 11 and 12 render the same remote component through a stand-in host that speaks the
documented remote component protocol and forwards `requestData` / `executeAction` to the real view-host
endpoints. The component, the data and the actions are the plugin's own; only the host chrome is a
stand-in. That host is committed as `tests/browser/host.html` + `tests/browser/serve-host.mjs`, so the
claim is reproducible on any machine without an app platform.

## Validation

See `docs/interview/03-validation.md` for the four layers (business logic, plugin loading, view
integration, platform business flow) with the exact commands and observed results.

## Known limits

* One ticket per proposal; batch triage is not implemented (the template prompt forbids batching).
* Priorities and teams are fixed enums; there is no admin UI to edit them.
* The demo backlog is a constant; there is no ticketing-system integration.
* No notifications, no outbound reply delivery, no SLA timer.
* Every write goes through `executeViewAction`; the view never writes directly.
* Remote component protocol version is fixed at 1; a future host protocol needs a small adapter.

## License

AGPL-3.0, same as the plugin repository.
