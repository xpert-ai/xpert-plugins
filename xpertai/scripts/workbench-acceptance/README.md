# Generated Workbench acceptance host

This credential-free host loads the deployable `app.js`/`app.css` files from both plugin `dist` directories. It does not connect to GitHub or Xpert. Business receipts appear in the `Host receipt` region; the parent owns test persistence and the plugin remains in an opaque-origin iframe.

Before running, build the local Shadcn package and both plugins, then run both `verify:dist` scripts. Start from `xpertai` with Node 24:

```sh
node scripts/workbench-acceptance/server.mjs
```

The host binds only to `127.0.0.1:4319` (`WORKBENCH_E2E_PORT` can override it). Use a fresh browser tab/session per run.

## Sites sequence

1. Open the site card, select **版本**, then **Reload view**. Assert the same site and pressed tab.
2. Open **发布版本**, cancel, and assert no action receipt.
3. Choose **Deny next action**, publish and confirm. Assert visible error, no deployment and a failed attempted action in the receipt.
4. Confirm again. Assert `deployedVersion` is the selected version and the modal closes.
5. Change scope. Assert the view stays usable, retains the selected site and sends a fresh Assistant-context command.
6. Assert the receipt has no uncaught errors. Capture the rendered view and dialog placement.

## Code Review sequence

1. Open the deterministic PR, inspect the diff and its P1 inline finding.
2. Mark `src/read.ts` viewed, open **发现 (1)**, reload the view. Assert the selected PR, finding tab and persisted `viewed` path.
3. Open **提交审查…**, inspect selected findings and conclusion, then cancel. Assert no `submit` action. The fixture deliberately rejects any external submission attempt.
4. Assert the receipt has no uncaught errors. Capture the finding and dialog states.

These sequences were exercised with semantic locators through the Codex browser tool on 2026-10-12. They complement the installed-platform acceptance in `../../docs/code-review-sites-acceptance.md`; this host cannot prove production auth, queues or model behavior.


## Automatic review sequence

The review fixture also supplies one repository and one pending run. It is clearly labeled as a representative host and never contacts GitHub.

1. Open **仓库 → 配置规则**, enable automation and choose automatic comments. Open **保存规则**, cancel, and verify no action was emitted.
2. Save again and confirm. Verify `repository.save` includes `confirmed: true`, the expected revision, bounded rules, and the repository now shows revision 2.
3. Return to the inbox, open **确认发布**, select **Deny next action** in the host and confirm. Verify the modal closes, an error is visible, and the run remains pending.
4. Verify recent PR navigation and an empty error receipt. The fixture tests rendering and bridge behavior only; use the PostgreSQL acceptance script for actual policy/queue services.
