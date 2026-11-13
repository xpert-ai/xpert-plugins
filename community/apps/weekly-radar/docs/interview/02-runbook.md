# 02 · 运行手册（Runbook）

## 1. 前置

- Node.js LTS（CI 锁 20；本机实测 Node 25 可跑规则测试，harness 需 `npx -y node@20`）
- corepack + pnpm（社区工作区锁 `pnpm@8.15.8`）
- Xpert 本地环境：API `3000`、Cloud `4200`、NsJail `8090`；就绪检查 `http://localhost:3000/api/health/ready`
- `PLUGIN_WORKSPACE_ROOTS` 必须同时包含**插件仓根**与**平台内置插件根** `<platform>/packages/plugins`

## 2. 构建

```bash
corepack pnpm install
corepack pnpm --filter @xpert-ai/plugin-weekly-radar build
```

构建链：`build:ui` → `remote:typecheck` → `build-remote-components.mjs`（esbuild IIFE + react shim）→ `tsc -p tsconfig.lib.json` → `copy-assets.mjs`。

## 3. 测试

```bash
corepack pnpm --filter @xpert-ai/plugin-weekly-radar test:rules
corepack pnpm --filter @xpert-ai/plugin-weekly-radar test
```

## 4. 部署（凭证只走环境变量）

```bash
export XPERT_USERNAME=... XPERT_PASSWORD=...
corepack pnpm plugin:deploy:local \
  --plugin-dir <repo>/community/apps/weekly-radar \
  --api-url "$XPERT_API_URL" \
  --scope tenant --tenant-id "$XPERT_TENANT_ID" \
  --manifest-file /tmp/plugin-deployment.json
```

`staged successfully` 不等于已运行。`restartRequired: true` 或 `loadStatus: pending_restart` 时必须重启 API 再验。

## 5. 六步冒烟

1. 安装插件 → 2. 重启 API 并验证加载 → 3. 打开助手模板 → 4. 基于模板创建助手 → 5. 绑定工具与工作台 → 6. 真实模型调用 + 人工确认 + 刷新恢复

## 6. 演示脚本（口述）

> "这是我这周做的事，帮我记成条目并扫一遍风险：本周完成客户回访 12 家，报价系统对接卡在对方接口文档没给，已经三天了。"

助手抽取条目并调用 `radar_upsert_entry` → 调用 `radar_scan_risks` → 工作台出现风险卡片（跨周未闭环 / 逾期未动）→ 助手调用 `radar_generate_weekly` → 周报草稿（数字与风险行服务端重算）→ 人工点「确认并归档」→ 刷新仍可回看。

## 7. 失败与重试

| 失败点 | 现象 | 处置 |
|---|---|---|
| 模型调用失败 | 条目停在 `ai_failed`，风险卡片给出 R3「失败未重试」 | 用同一 `operationId` 重试 → 唯一索引命中旧条目，不产生重复 |
| 助手未确认 | 条目 `pending_confirm` 超过阈值 | R2 命中，工作台可直接改状态 |
| 部署未生效 | `staged successfully` 但助手无工具 | 查 `restartRequired` / `loadStatus`，重启 API 后复验 |
