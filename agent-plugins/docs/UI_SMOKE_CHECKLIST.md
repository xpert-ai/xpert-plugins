# Agent Plugins UI smoke checklist

Cleaned case list from the 2026-10-10 Round 1 page smoke. Bring the stack up
with [SMOKE_ENV.md](SMOKE_ENV.md), then use section 9 below. Menu labels in the
product win over the names written here; if a label differs, record the visible
text in the result table.

Two surfaces:

| Surface | When | What it proves |
| --- | --- | --- |
| Install | Every pass | Import, publish, catalog, `mcp_oauth` shape, no packaged secrets |
| Connection | Only after OAuth clients exist | Consent, `tools/list`, one read, sandbox write approval |

A missing GitHub, Slack, Notion, Figma, or Google client skips the connection
surface. It does not fail the install pass. See the client table in
[SMOKE_ENV.md](SMOKE_ENV.md).

## Round 1 scope

| Order | PR | Path | Review note carried into this list |
| --- | --- | --- | --- |
| 1 | [#713](https://github.com/xpert-ai/xpert-plugins/pull/713) | `agent-plugins/github` | Conditional pass |
| 2 | [#711](https://github.com/xpert-ai/xpert-plugins/pull/711) | `agent-plugins/slack` | Conditional pass. Tool names need a live `tools/list` |
| 3 | [#715](https://github.com/xpert-ai/xpert-plugins/pull/715) | `agent-plugins/notion` 1.2.0 | New binding required |
| 4 | [#714](https://github.com/xpert-ai/xpert-plugins/pull/714) | `agent-plugins/figma` | Internal only. Not a Marketplace pass |
| 5 | [#712](https://github.com/xpert-ai/xpert-plugins/pull/712) | `agent-plugins/google-drive` | Four connectors |

## Rules for every case

1. Reads first. Search, fetch, and list are the default. Writes are separate cases.
2. Writes use a disposable sandbox only: a test GitHub repo, a test Slack channel, a disposable Notion parent, a Figma draft, a Drive test folder. No production data, customer repos, or customer pages.
3. Figma stays internal. Do not report it as a public Integration or Marketplace pass.
4. Notion 1.2.0 is a new binding. Do not silently replace a conversation pinned to 1.1.0.
5. Packages contain no OpenAI client secrets. Connectors are `type: mcp_oauth`.

## 9. Execution checklist

Read this before the case catalog. Install boxes are always in scope.
Connection boxes stay unchecked until connector setup is done.

### Install surface (always)

**A. Environment**

- [ ] A1. Stack is up. UI `http://127.0.0.1/`. API `http://127.0.0.1:3000/api/health/ready`. Project name matches `xpert-smoke-*`.
- [ ] A2. Admin signs in. Organization is **Xpert Local**. Bare tenant is not the scope under test. Workspace is **Default Workspace**.
- [ ] A3. Note whether the test Assistant has `composer.resources.enabled` (or the visible Plugins control under the composer). Needed for connection chat, not for publish.

**B. Publish, review order**

- [ ] B1. ZIP or Git ref matches the round under test.
- [ ] B2. GitHub → GH-01.
- [ ] B3. Slack → SL-01.
- [ ] B4. Notion 1.2.0 as a new binding → NT-01. Do not mark NT-02 passed on a fresh environment.
- [ ] B5. Figma, labeled internal → FG-00, FG-01.
- [ ] B6. Google Drive → GD-01. If local `documents` / `pdf` / `presentations` / `spreadsheets` are published, run GD-03.

**Install observations**

- [ ] NT-03. Five Notion skills visible in the 1.2.0 details.
- [ ] FG-06. Figma remains externally blocked.
- [ ] X-01. Five packages visible together. Figma marked internal.
- [ ] X-02. No packaged OpenAI client secret.
- [ ] X-03. After merge, the agent-plugins README lists the new packages.

**Close the install pass**

- [ ] D1. Result table filled for the install ids (pass / fail / skip + evidence).
- [ ] D4. The report does not claim consent, live tool lists, or NT-02 unless those cases ran.

### Connection surface (only when OAuth clients exist)

Skip this whole block when the clients in [SMOKE_ENV.md](SMOKE_ENV.md) are absent.
Record `skipped: connector setup`.

**Extra setup**

- [ ] A4. Sandbox targets exist: GitHub test repo, Slack test channel, disposable Notion page, Figma draft, Google test folder.
- [ ] A5. For NT-02 only: a conversation already pinned to Notion 1.1.0 with at least one message. A fresh environment cannot create this retroactively.
- [ ] A6. Browser network panel and API logs are available.

**GitHub**

- [ ] GH-02. OAuth, and record `resource` versus MCP URL trailing slash.
- [ ] GH-03. `tools/list`.
- [ ] GH-04. One read.
- [ ] GH-05. Write is blocked or needs confirmation, on the sandbox repo only.
- [ ] GH-06. Record the scopes actually selected. Do not default to full `repo`.

**Slack**

- [ ] SL-02. OAuth.
- [ ] SL-03. Live `tools/list` compared with Skill names. This is the Slack evidence.
- [ ] SL-04. One read, using a name that SL-03 showed.
- [ ] SL-05. Write blocked or confirmed, test channel only.

**Notion**

- [ ] NT-02. Old 1.1.0 conversation stays pinned. Skip with `fresh env` when A5 is false.
- [ ] NT-04. OAuth.
- [ ] NT-05. Search and fetch, read-only.
- [ ] NT-06. Write blocked unless the tester names a disposable parent.
- [ ] NT-07. Optional lifecycle observation (`corepack pnpm test:lifecycle`).

**Figma (internal)**

- [ ] FG-02. OAuth. On failure, paste the raw error. Do not call the package usable.
- [ ] FG-03 through FG-05. Only after FG-02 grants. Do not permanently disable write tools to force a pass.
- [ ] FG-06. Already required on the install surface; leave the external block in place.

**Google Drive**

- [ ] GD-02. Four resources consent separately, minimum scopes.
- [ ] GD-04. Record scopes. Full `drive` as the default is a P1 reproduction; narrow it before any write.
- [ ] GD-05. One read.
- [ ] GD-06. Write blocked or confirmed, test folder only.
- [ ] GD-07. Optional read on Docs, Sheets, and Slides.

**Close the connection pass**

- [ ] D2. Disconnect the shared test connection or disable the test binding.
- [ ] D3. Delete sandbox issues, messages, pages, and files created on purpose.
- [ ] D4. Report whether P0/P1 items showed in the UI, the raw Figma error, the Slack tool-name table, and whether the old Notion conversation stayed on 1.1.0.

## Shared steps

### G-01 · Import and publish (install)

1. With **Xpert Local** selected, open **Plugins → Agent Plugins**.
2. Upload the ZIP from `/tmp/xpert-agent-plugins/`, or Git-import the repository URL, pinned ref, and subdirectory `agent-plugins/<name>`.
3. Review Skills, `mcp.json` (`streamable-http`), and `extensions.xpertai.connectors` → `mcp_oauth`.
4. Publish to **Default Workspace**. For Notion, publish a new binding. If the form offers **Replace version**, still run NT-02 before claiming old conversations stayed pinned.
5. Optional Desktop path: **Discover & add → Plugins** adds an already imported package to an editable workspace.

Expected: the workspace catalog shows the package, no `client_id` / `client_secret` is inside the bundle, and the connector type is `mcp_oauth`.

### G-02 · Select the plugin and finish OAuth (connection)

1. Refresh the conversation page so the catalog reloads.
2. Open the test Assistant. The Plugins entry under the composer requires `composer.resources.enabled`.
3. Select the package and open details.
4. If status is **requires authorization**, an administrator starts **Connect account**. That opens the workspace Connector flow (Desktop may use `autostart=1`). Other members ask an administrator for the shared connection.
5. Finish provider consent in the browser and return. Catalog status becomes granted.

Expected: OAuth is the Connector flow. No OpenAI client appears from the package. A failed attempt keeps the draft selection.

### G-03 · Skill visible and one read (connection)

Confirm the Skill name, send the read prompt from the package section, and check the tool card. No write side effect.

### G-04 · Write is blocked or needs confirmation (connection)

Ask for one write against the sandbox target.

- Host approval appears: reject it, and confirm nothing was created.
- The agent refuses from the Skill text only: record `copy constraint, no host approval`.
- The write lands with no confirmation: record it as a risk, with the tool name and a screenshot.

Run a successful write only on the sandbox, and only when the tester explicitly accepts it. Read it back, then delete it.

### Shared failure checks

| Symptom | Look at |
| --- | --- |
| Import failed | `POST /api/agent-plugins` response, root `plugin.json` in the ZIP, stdio or invalid Skill diagnostics |
| Catalog empty | Organization is **Xpert Local**, binding published to this workspace, page refreshed, binding not `enabled: false` |
| OAuth will not open, or 401 | Administrator versus member, shared versus old personal connection, callback cookie / `withCredentials`, Connector client |
| Tool call 403 | Binding disabled, grant revoked, execution snapshot expired |
| Unknown tool name | MCP `tools/list` aligned with the Skill |
| Resource mismatch | Discovered OAuth `resource` versus MCP URL, especially a trailing slash on GitHub |

## 3. GitHub

Review notes to watch: advertised scopes include broad `repo`; write tools are exposed; discovered OAuth `resource` has **no** trailing slash while the MCP URL **has** one.

### GH-01 · Install visibility (install)

| | |
| --- | --- |
| Steps | G-01 for `github`. Search `GitHub`. Details: Skill `github-workspace`, MCP `https://api.githubcopilot.com/mcp/`, connector `mcp_oauth`. |
| Expected | Visible, `streamable-http`, no embedded secret. Other packages were not rewritten. |
| On failure | Import diagnostics, `plugin.json` name/version, quickstart log. |

### GH-02 · OAuth and resource slash (connection)

| | |
| --- | --- |
| Steps | G-02. Use the test OAuth App. Keep scopes minimal. In network logs, compare the authorize/token `resource` with the MCP URL. |
| Expected | Granted. `resource` has no trailing `/`. MCP URL has a trailing `/`. If the host sends the MCP URL as `resource`, record the refresh failure as a reproduced review risk. |
| On failure | Connector form, discovery metadata, token error text. |

### GH-03 · tools/list (connection)

| | |
| --- | --- |
| Steps | After grant, list tool names. Compare with Skill names such as `issue_write` and `create_pull_request`. Do not call writes. |
| Expected | A written diff of names. Differences are results, not silent edits. |

### GH-04 · One read (connection)

Prompt: read the README or recent issues of the test repo. Do not create an issue, open a pull request, or push.

### GH-05 · Write confirmation (connection)

Prompt: create an issue titled `smoke-do-not-merge` on the disposable test repo. Prefer rejecting approval. Confirm the issue does not exist. An unconfirmed write is a recorded risk.

### GH-06 · Scope note (connection)

Record the scopes actually selected. Do not treat full `repo` as the required default, and do not widen a token just to continue testing.

## 4. Slack

Review note: aside from two documented upload tool names, other Skill names came from a third-party catalog and were not verified with an authenticated `tools/list`.

### SL-01 · Install visibility (install)

G-01 for `slack`. Skill `slack-workspace`, MCP `https://mcp.slack.com/mcp`, connector `mcp_oauth`. No OpenAI Slack `client_id`, `.app.json`, or `.codex-plugin`.

### SL-02 · OAuth (connection)

Own Slack app, test workspace, smallest scopes that still allow the read. Shared connection reaches granted.

### SL-03 · Live tool names (connection)

Export the Slack MCP tool list. Mark `slack_get_file_upload_url` and `slack_complete_file_upload` as the names confirmed by Slack's docs. Mark every other Skill candidate, including `slack_send_message` and `slack_search_public`, as present or absent. Do not treat an absent candidate as supported.

### SL-04 · One read (connection)

Use a read tool that SL-03 showed. Summarize recent public messages in the test channel. Do not post, upload, or edit a canvas. If no read tool exists, stop and skip SL-05.

### SL-05 · Write confirmation (connection)

Ask to post `ui-smoke-ignore` to `#smoke-test`. Reject approval when it appears. If a message is posted, record the risk and delete it.

## 5. Notion 1.2.0

P0: new binding. A fresh smoke environment cannot prove NT-02.

### NT-01 · New binding (install)

Pack or import `notion` and confirm version **1.2.0**. Publish a new binding. Catalog shows 1.2.0. `mcp.json` still points at `https://mcp.notion.com/mcp`. Skill `notion-workspace` remains.

### NT-02 · 1.1.0 conversation stays pinned (connection; prior conversation required)

Open the conversation that selected Notion 1.1.0 and sent a message **before** 1.2.0 was published. Its runtime resources or detail digest stay on 1.1.0. A new conversation can select 1.2.0. The Assistant graph is unchanged.

If this environment never had 1.1.0, mark NT-02 `skipped: fresh env`. Do not backfill history and call it proven.

### NT-03 · Five skills (install)

Details for 1.2.0 include `notion-workspace`, `notion-knowledge-capture`, `notion-meeting-intelligence`, `notion-research-documentation`, and `notion-spec-to-implementation`. A skill dropped by frontmatter is a P1 metadata result.

### NT-04 · OAuth (connection)

Connect from the plugin details page. Granted, no embedded secret. Hosted tool aliases such as `notion-search` and `notion-fetch` match the server.

### NT-05 · Read (connection)

Search for a known test page title, then fetch that result. Do not pass an external URL to fetch. Do not create or edit.

### NT-06 · Write confirmation (connection)

Without a named parent, a request to create a page must refuse or wait for approval. Create once only when the tester names a disposable parent, then fetch and delete.

### NT-07 · Lifecycle observation (optional)

UI pass for NT-03 is enough for the install surface. Optionally run `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` and record parser errors.

## 6. Figma · internal only

P0 for public release: Developer Terms require a separate privacy policy and legal review, and the package does not include one. Do not permanently disable write tools in the host to make the trial look safe.

### FG-00 · Internal banner (install)

Result header says `Figma = internal only / not a public Integration / not a Marketplace pass`. README and catalog must not say the package is externally compliant.

### FG-01 · Install visibility (install)

Skill `figma-workspace`, MCP `https://mcp.figma.com/mcp`, connector `mcp_oauth`. Icon may be a remote favicon URL. Upstream skill assets that the Terms restrict are not copied into the package.

### FG-02 · OAuth (connection)

Try the Connector flow. If a client secret is required (`client_secret_basic` or `client_secret_post`), put it in the Connector form, not in the package. On failure, copy the page text, HTTP status, and body, including catalog or allow-list rejection. Label the case `environment limited`, not a bad UI step.

### FG-03 · Tools (connection)

Skip when FG-02 failed. Otherwise list tools and note names such as `use_figma`, `create_new_file`, and `generate_diagram`.

### FG-04 · Read (connection)

Read a named test file or node. Do not change the canvas or create a file.

### FG-05 · Write and Terms §4.f (connection)

An unrequested write is refused or sent to approval. A requested write on a disposable draft may proceed with host approval. Do not turn off every Figma write tool in platform config to get a green result.

### FG-06 · Privacy status (install)

Package still has no privacy policy. Marketplace publication stays blocked.

## 7. Google Drive

Metadata may advertise full `drive`; the package cannot pin the scope. Write tools are in the schema. Four connectors need four consents. The package complements local `documents`, `pdf`, `presentations`, and `spreadsheets`. It does not replace them.

| Connector / skill | MCP URL |
| --- | --- |
| `google-drive` | `https://drivemcp.googleapis.com/mcp/v1` |
| `google-docs` | `https://docsmcp.googleapis.com/mcp/v1` |
| `google-sheets` | `https://sheetsmcp.googleapis.com/mcp/v1` |
| `google-slides` | `https://slidesmcp.googleapis.com/mcp/v1` |

### GD-01 · Install visibility (install)

One package shows four skills, four `streamable-http` servers, and four `mcp_oauth` connectors. No embedded secret.

### GD-02 · Four consents (connection)

Connect Drive, Docs, Sheets, and Slides separately. Record whether one Google client is reused and whether four consents happened. Prefer `drive.readonly` or `drive.file` plus each product's read scope. Do not default to full `drive`. A missing Developer Preview is a recorded skip for that resource.

### GD-03 · Local packages remain (install, when those packages are published)

The same workspace still shows `documents`, `pdf`, `presentations`, and `spreadsheets` next to `google-drive`. Copy describes remote Docs/Sheets/Slides versus local DOCX/XLSX/PPTX. If the local packages were never published in this environment, mark GD-03 `skipped: local packages not installed` instead of failing.

### GD-04 · Scope observation (connection)

Record the scopes each Connector requests. If the form defaults to full `drive`, mark P1, narrow the set, and only then retry the read.

### GD-05 · One read (connection)

List or search the test folder for a known name. Do not create, copy, or update. Optionally open one test Doc when Docs is granted.

### GD-06 · Write confirmation (connection)

Ask to create `ui-smoke-tmp` in the test folder. Reject approval, or confirm the file was not created. Delete it if an approved write was intentional.

### GD-07 · Optional product reads (connection)

One read each for a test Doc, Sheet, and Slide. Skip any product that is not granted.

## 8. Cross-package

| ID | Surface | Expected |
| --- | --- | --- |
| X-01 | Install | `github`, `slack`, `notion`, `figma`, and `google-drive` are all visible. Figma is internal |
| X-02 | Install | Connector form and package details have no in-bundle `client_secret` |
| X-03 | Install, after merge | agent-plugins README lists the packages that landed |
| X-04 | Connection | Disconnecting one shared connection returns that catalog entry to unauthorized, and the next tool call is 403 |

## 10. Index

| Package | Ids |
| --- | --- |
| Shared | G-01 (install), G-02–G-04 (connection) |
| GitHub | GH-01 install; GH-02–GH-06 connection |
| Slack | SL-01 install; SL-02–SL-05 connection |
| Notion | NT-01, NT-03 install; NT-02 and NT-04–NT-07 connection or optional |
| Figma | FG-00, FG-01, FG-06 install; FG-02–FG-05 connection |
| Google Drive | GD-01, GD-03 install; GD-02, GD-04–GD-07 connection |
| Cross-package | X-01–X-03 install; X-04 connection |

Install-surface core is section 9's first block. The original template counted 40 rows including observation and optional cases; do not treat a skipped connection row as an install failure.

## Result table

| Case | Result | Evidence (screenshot, log, resource, scope, tool name) | Notes |
| --- | --- | --- | --- |
| GH-01 | | | |
| GH-02 | | resource= MCP URL= | connection |
| NT-02 | | old conversation version= | `fresh env` if no 1.1.0 pin |
| FG-02 | | raw error= | internal |
| GD-02 | | four granted? scopes= | connection |
| GD-03 | | local four still present? | |
