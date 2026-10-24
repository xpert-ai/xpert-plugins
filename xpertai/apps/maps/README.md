# Xpert Maps / 地图

Interactive maps in Xpert conversations: place search, nearby search, linked markers and cards, place details, driving/walking routes, pan/zoom, fit all, and fullscreen. AMap is the default; Tencent is interchangeable behind a typed provider interface.

## Marketplace cover and setup

The Maps app entry links to the live `maps-assistant` template. Catalog setup creates a dedicated organization workspace and publishes that Assistant using an available primary model. Connect and authorize AMap or Tencent Maps in the workspace before using real maps. The separate demo template remains available for explicit simulated previews.

The first `appConfig.presentation.screenshots` entry is the [Chinese cover](assets/brand/maps-overview-zh-v1.png), declared in `.xpertai-plugin/plugin.json` and included in the published package. The opaque 1600 × 900 image follows the Meetings composition: brand and headline on the left, an illustrative map on the right, 5% top/side margins, and a quiet bottom 30% for the host's information overlay. The map and places are fictional. Generated with the built-in imagegen tool using the [saved prompt](assets/brand/maps-overview-zh-v1.prompt.txt).

Run `pnpm exec nx run @xpert-ai/plugin-maps:verify:app-config` from `xpertai/` after building to verify the live template link, runtime/portable metadata agreement and declared screenshot. Cover assets are included in the distribution freshness check.

## Workbench

地图显示在 Xpert 右侧 Workbench：紧凑搜索栏、主地图和底部结果 / 详情 / 路线托盘。界面使用当前仓库的 shadcn/ui + Tailwind 4，宿主管理对话、分栏、标签和展开；插件不重复创建应用外壳。原生 MCP App 复用同一 React 组件。供应商 Key 仅由服务端读取，静态地图在停止拖动或缩放后刷新。

Both entries share a host-first theme adapter: Remote View tokens and standard MCP App styles map to shadcn semantic colors, typography, radius and density. Standard MCP colors also supply derived shadcn roles before legacy `--mcp-app-*` fallbacks, so dynamic updates cannot leave inputs using an old injected border. Form controls consume host height and font-size tokens; rem-based layout follows the host root size, while map markers and zoom controls retain a 44px minimum target. MCP has no density field and follows the typography and radius values actually provided. Theme notifications retain map state and remove withdrawn overrides; host-driven iframe replacement is a separate lifecycle boundary.

- [安装与配置](docs/quickstart.mdx)
- [架构、供应商扩展与限制](docs/architecture.mdx)
- [测试与验收](docs/verification.mdx)
- [调查与资料来源](docs/research.mdx)

Requires the accompanying Xpert develop changes: `ViewMiddlewareRuntimeCapability` for authorized Workbench requests and the middleware App Connector grant restoration fix. Published SDK/contracts 3.21.0 alone do not contain the new View capability. Build the matching host SDK for local development; do not replace public dependency declarations with machine-specific paths. Demo mode requires no credentials. Demo data is synthetic and clearly marked; live mode never falls back to demo.

```sh
# From xpertai/ (Corepack selects the declared pnpm version)
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm exec nx build @xpert-ai/plugin-maps
corepack pnpm exec nx test @xpert-ai/plugin-maps
corepack pnpm exec nx run @xpert-ai/plugin-maps:test-browser
```

Local simulated preview after building: `node scripts/preview-server.mjs` (localhost port 4381).

Organization-scoped plugin; no database entities, REST routes, external MCP server, or browser credentials. Install Maps and create an Assistant from **地图助手** (live) or **地图助手 · 模拟演示** (demo). Existing Assistants can add the **Maps / 地图** middleware and configure `provider` and `mode`. Live mode uses the matching enabled workspace Connector. Selected places can be appended as references to the current draft without sending it.
