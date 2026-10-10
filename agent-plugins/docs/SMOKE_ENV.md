# Agent Plugins UI smoke environment

Permanent stage for smoking portable Agent Plugins in the platform UI.
Recorded from the Cursor Cloud run on 2026-10-10 (Round 1: GitHub, Slack,
Notion 1.2.0, Figma, Google Drive). Later rounds should reuse this pipeline
instead of rediscovering ports, organization scope, or where credentials live.

This stage is the compose UI. It is not:

- the source-dev servers documented in [the package README](../README.md)
  (`http://localhost:3333` API, Angular on `4200` or `4300`);
- `corepack pnpm test:lifecycle` in [plugin-dev-harness](../../plugin-dev-harness/README.md),
  which parses ZIPs and does not boot the UI;
- the disposable Connector harness, which never signs in to GitHub, Slack,
  Notion, Figma, or Google.

Case list: [UI smoke checklist](UI_SMOKE_CHECKLIST.md). Run the install surface
on every pass. Run connector and OAuth cases only after the OAuth clients in
that checklist exist.

## Stack

The Cursor Cloud environment mounts both checkouts:

| Checkout | Repository | Role |
| --- | --- | --- |
| `$XPERT_PLATFORM_ROOT` | [xpert-ai/xpert](https://github.com/xpert-ai/xpert) | Compose stack and login helper |
| `$XPERT_PLUGINS_ROOT` | this repository | Packages under test |

Start compose from `$XPERT_PLATFORM_ROOT/docker`, not from this repository.
Name the project `xpert-smoke-*` so it stays distinct from any other compose
project on the VM.

| Surface | Address | Use |
| --- | --- | --- |
| UI | `http://127.0.0.1/` (host port 80, `WEB_PORT`) | Browser, onboarding, Plugins |
| API | `http://127.0.0.1:3000` (`API_PORT`) | `GET /api/health/ready`, quickstart `--api-url` |

`http://127.0.0.1:3000` is the API. Do not open it as the UI. The webapp
container publishes both ports; nginx on port 80 is the page. Inside the API
container the same readiness path is `http://localhost:3000/api/health/ready`.

## Bootstrap

### 1. Start compose

From the platform checkout:

```sh
cd "$XPERT_PLATFORM_ROOT/docker"
test -f .env || cp env.example .env
export COMPOSE_PROJECT_NAME="xpert-smoke-$(date -u +%Y%m%d)"
docker compose up -d
```

`docker/.env` stays in the platform checkout. Do not commit it, and do not
copy its values into this repository. `env.example` is only a local template.

### 2. If the Docker bridge is dropped

On the 2026-10-10 VM the host iptables `FORWARD` policy was `DROP`. Containers
can look healthy while the published ports never answer, because the compose
bridge is not forwarded.

```sh
iptables -S FORWARD | head
docker network inspect "${COMPOSE_PROJECT_NAME}_overlay" --format '{{.Id}}'
```

When the policy is `DROP`, accept forwarding for that bridge. The bridge
device is `br-` plus the first 12 characters of the network id. Reapply after
the network is recreated; the id changes and the rule is not saved in git.

```sh
BRIDGE=$(docker network inspect "${COMPOSE_PROJECT_NAME}_overlay" --format '{{.Id}}' | cut -c1-12)
iptables -C FORWARD -i "br-${BRIDGE}" -j ACCEPT 2>/dev/null || iptables -I FORWARD -i "br-${BRIDGE}" -j ACCEPT
iptables -C FORWARD -o "br-${BRIDGE}" -j ACCEPT 2>/dev/null || iptables -I FORWARD -o "br-${BRIDGE}" -j ACCEPT
```

If the network name differs, pick the bridge whose compose label matches
`xpert-smoke-*`. Do not open `FORWARD` for unrelated interfaces.

### 3. Readiness

```sh
curl -fsS "http://127.0.0.1:3000/api/health/ready"
curl -fsS -o /dev/null -w '%{http_code}\n' "http://127.0.0.1/"
```

Then open `http://127.0.0.1/` in the browser.

### 4. Create the admin through onboarding

A fresh database stops on onboarding (welcome, then tenant details). Create
the super admin there and name the default organization **Xpert Local**.
That is the organization name from the 2026-10-10 smoke, not a hard-coded
product default.

Store the login only at `/home/ubuntu/.xpert-local/admin.env`, mode `0600`.
The platform installer reads `XPERT_USERNAME` (the onboarding email) and
`XPERT_PASSWORD`. On this Linux VM the macOS Keychain helper is absent, so
those variables are the credentials. Keep organization and workspace ids in
the same file after the UI shows them. Do not also set `XPERT_TOKEN` unless
you intend to skip password login; a stale token wins over the password.

```sh
install -d -m 0700 /home/ubuntu/.xpert-local
umask 077
cat > /home/ubuntu/.xpert-local/admin.env <<'EOF'
XPERT_USERNAME=
XPERT_PASSWORD=
XPERT_ORG_NAME=Xpert Local
XPERT_ORG_ID=
XPERT_WORKSPACE_ID=
XPERT_API_URL=http://127.0.0.1:3000
XPERT_PLATFORM_ROOT=
XPERT_PLUGINS_ROOT=
EOF
chmod 0600 /home/ubuntu/.xpert-local/admin.env
```

Fill the empty values in the VM. Never commit the file, print it, or paste it
into a pull request. It lives outside the worktree. Do not mint a JWT from
`JWT_SECRET` or from database rows.

Source it without echoing:

```sh
set -a
# shellcheck disable=SC1091
. /home/ubuntu/.xpert-local/admin.env
set +a
```

### 5. Switch to organization Xpert Local

Agent Plugins are organization-scoped. After login the UI can still be on the
bare tenant. That scope has no organization id, and **Plugins → Agent Plugins**
stays empty even when packages are installed. Switch the organization control
to **Xpert Local** before import, publish, or catalog checks.

Organization bootstrap then creates **Default Workspace**. Wait until that
workspace exists before publishing. Capture its id into `XPERT_WORKSPACE_ID`.

## Publish the packages under test

Round 1 published these packages into the running platform. Repeat the same
install for whichever packages the current round is testing.

| Order | Package | Round 1 ref | Publish rule |
| --- | --- | --- | --- |
| 1 | `github` | [PR 713](https://github.com/xpert-ai/xpert-plugins/pull/713) | Test organization only |
| 2 | `slack` | [PR 711](https://github.com/xpert-ai/xpert-plugins/pull/711) | Test organization only |
| 3 | `notion` 1.2.0 | [PR 715](https://github.com/xpert-ai/xpert-plugins/pull/715) | **New binding**. Do not silently replace a conversation pinned to 1.1.0 |
| 4 | `figma` | [PR 714](https://github.com/xpert-ai/xpert-plugins/pull/714) | Internal trial only. Not a Marketplace pass |
| 5 | `google-drive` | [PR 712](https://github.com/xpert-ai/xpert-plugins/pull/712) | Four `mcp_oauth` connectors in one package |

UI path, while **Xpert Local** is selected: **Plugins → Agent Plugins**. Upload
the ZIP or Git-import `https://github.com/xpert-ai/xpert-plugins` at the pinned
ref with subdirectory `agent-plugins/<name>`. Review Skills, `mcp.json`
(`streamable-http`), and `extensions.xpertai.connectors` with `type: mcp_oauth`.
Publish to **Default Workspace**.

CLI path, after `admin.env` contains the organization and workspace ids. The
API origin is port 3000, not the UI origin and not `3333`:

```sh
cd "$XPERT_PLUGINS_ROOT/agent-plugins"
corepack pnpm install --frozen-lockfile
corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins \
  github slack notion figma google-drive
corepack pnpm quickstart --install \
  --platform-root "$XPERT_PLATFORM_ROOT" \
  --api-url "http://127.0.0.1:3000" \
  --org-id "$XPERT_ORG_ID" \
  --workspace-id "$XPERT_WORKSPACE_ID" \
  github slack notion figma google-drive
```

`quickstart --install` only accepts ids listed by `quickstart --list` on that
checkout. Round 1 packages were still on open pull requests, so Git or ZIP
import of each ref is valid when the name is not in `quickstart.json` yet.
`--replace` creates a new workspace binding and keeps old conversations on the
previous version; for Notion that still requires the NT-02 check below, and a
fresh database cannot satisfy it.

Refresh the conversation page after publish. The catalog is cached.

## Optional Cloudflare tunnel

In-VM testing uses `http://127.0.0.1/` and does not need a tunnel. Use a tunnel
only when an external tester cannot reach the VM:

```sh
cloudflared tunnel --url http://127.0.0.1:80
```

Tunnel the UI port. Do not hand out `:3000` as the page. The quick tunnel URL
is ephemeral; do not commit it. It does not register OAuth redirect URIs, so
it does not unblock the connection surface.

## Policy notes

- **Figma** is internal only. Developer Terms still block a public Marketplace
  listing. An install-surface pass must not be reported as a Marketplace pass.
- **Notion NT-02** needs a conversation that already selected Notion 1.1.0 and
  sent a message before 1.2.0 was published. A fresh smoke database has no such
  conversation, so it cannot prove the pin. To prove it later: publish 1.1.0,
  pin a conversation with a message, then publish 1.2.0 as a new binding.
- Packages do not embed OpenAI client secrets, `.app.json` app ids, or
  `.codex-plugin` manifests. Connector rows are `mcp_oauth`.
- Default the pass to read-only. Writes stay on disposable sandbox targets
  (test repo, test channel, disposable Notion parent, Figma draft, Drive test
  folder). Do not touch production or customer data.

## Out of scope for an install-surface pass

GitHub, Slack, Notion, Figma, and Google OAuth clients are not part of bringing
the stack up or publishing packages. They are a separate connector-setup
prerequisite for the connection surface:

| Provider | Client the connection surface needs |
| --- | --- |
| GitHub | OAuth App owned by the test account. Do not default to full `repo` |
| Slack | Slack app installed on a test workspace |
| Notion | Integration or MCP OAuth account, plus a disposable parent page |
| Figma | Developer account. A confidential client may be required; catalog rejection is a recorded result, not a UI-step failure |
| Google Drive | Google Cloud OAuth **Web** client. Drive, Docs, Sheets, and Slides each consent separately. Do not default to full `drive` |

Without those clients, stop after the install surface and mark connection
cases skipped. Do not invent clients or copy secrets into a package.

## Install-surface checklist

Short entry for section 9 of [UI_SMOKE_CHECKLIST.md](UI_SMOKE_CHECKLIST.md).
Tick these on every round. Leave connection cases for the other half of that
file.

### A. Environment

- [ ] A1. Compose project `xpert-smoke-*` is up. UI is `http://127.0.0.1/`. API ready is `http://127.0.0.1:3000/api/health/ready`.
- [ ] A2. Admin from `/home/ubuntu/.xpert-local/admin.env` can sign in. Organization control is **Xpert Local**, not the bare tenant. **Default Workspace** exists.
- [ ] A3. Record whether a test Assistant has `composer.resources.enabled`. Required only before connection-surface chat.

### B. Publish, in review order

- [ ] B1. ZIP or Git ref points at the packages under test.
- [ ] B2. **GitHub** published. GH-01: visible, `streamable-http`, connector `mcp_oauth`, no embedded secret.
- [ ] B3. **Slack** published. SL-01: same structural checks.
- [ ] B4. **Notion 1.2.0** published as a **new binding** (NT-01). Do not mark NT-02 passed on a fresh environment.
- [ ] B5. **Figma** published with an internal label (FG-00, FG-01). Not a Marketplace result.
- [ ] B6. **Google Drive** published with four skills and four `mcp_oauth` connectors (GD-01). If `documents` / `pdf` / `presentations` / `spreadsheets` were already published, confirm they remain (GD-03).

### C. Install-surface observations

- [ ] NT-03. Notion 1.2.0 details list `notion-workspace`, `notion-knowledge-capture`, `notion-meeting-intelligence`, `notion-research-documentation`, and `notion-spec-to-implementation`.
- [ ] FG-06. Figma still has no privacy policy and is not publicly listed.
- [ ] X-01. All five packages are visible. Figma stays marked internal.
- [ ] X-02. Package details and Connector forms show no OpenAI `client_id` / `client_secret`.
- [ ] X-03. If the round has merged, the agent-plugins README table includes the new rows.

### D. Close the install pass

- [ ] D1. Result table records pass, fail, or skip plus evidence for the ids above.
- [ ] D4. Report does not claim OAuth consent, live `tools/list`, Slack tool-name parity, or Notion 1.1.0 pinning unless those connection cases actually ran.

## Related

- [UI smoke checklist](UI_SMOKE_CHECKLIST.md) — full case catalog, including the gated connection surface.
- [Package README](../README.md) — quickstart and Connector contract.
- [Upstream comparison](UPSTREAM.md) — provenance. It does not describe this stack.
