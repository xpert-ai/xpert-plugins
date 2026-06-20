# Community Workspace

基于 pnpm 的多包工作区，包含工具、middlewares、模型适配与 agent 等子包。本文档说明基础用法、脚手架和发布流程。

## 准备
- 安装 pnpm（>= 8）：`npm i -g pnpm`
- 进入目录：`cd community`
- 安装依赖：`pnpm install`

## 创建子包
使用脚本生成包骨架（会创建 package.json、tsconfig、README、src/index.ts）：
```sh
pnpm create:package --scope tools --name demo-tool --description "Example tool" --public
```
参数：
- `--scope`: apps | tools | middlewares | models | packages
- `--name`: 子包目录与包名尾缀（自动转为小写短横线）
- `--description`: 可选描述
- `--public`: 可选，生成时将 `publishConfig.access` 设为 public

生成后可直接在子包内填充代码、依赖和测试。

## 常用命令
以下命令默认在 `community/` 目录执行。

### 工作区
- 安装依赖：`pnpm install`
- 构建全部子包：`pnpm build`
- 构建有 build 脚本的子包：`pnpm -r --if-present build`
- 运行测试：`pnpm test`
- 运行 lint：`pnpm lint`

### 单包本地开发
将 `<pkg>` 替换为包名（如 `@xpert-ai/plugin-sales-ontology`）或相对路径（如 `./apps/sales-ontology`）。

```sh
pnpm --filter <pkg> build
pnpm --filter <pkg> test
pnpm --filter <pkg> lint
pnpm --filter <pkg> pack
```

常用示例：

```sh
pnpm --filter @xpert-ai/plugin-sales-ontology build
pnpm --filter ./apps/sales-ontology test
pnpm --filter ./apps/sales-ontology pack
```

### Changesets
变更需要发版时，提交代码的同时提交 `.changeset/*.md`。

```sh
pnpm exec changeset add
pnpm exec changeset status
```

维护者本地验证发版计划时可运行：

```sh
pnpm exec changeset version
pnpm run release:publish
```

通常不需要在功能分支手动执行 `changeset version` 或 `release:publish`；合并后由仓库的 release workflow 创建 release PR 并发布到 npm。

### 插件生命周期验证
修改任何插件后，按根目录 `plugin-dev-harness/README.md` 运行生命周期测试。示例：

```sh
pnpm -C ../plugin-dev-harness install
pnpm -C ../plugin-dev-harness build
pnpm --filter @xpert-ai/plugin-sales-ontology build
node ../plugin-dev-harness/dist/index.js --workspace . --plugin @xpert-ai/plugin-sales-ontology
```

### 本地 Xpert 安装
本地安装配置统一放在 `community/.env`，不要提交真实 token、组织 ID 或本地环境值。

```sh
cp env.example .env
# 编辑 .env，至少填写 XPERT_API_URL、XPERT_TOKEN，以及组织级安装所需的 XPERT_ORG_ID。
set -a
source .env
set +a

PLUGIN_DIR="$(pwd)/${XPERT_PLUGIN_WORKSPACE_PATH#./}"
pnpm --filter "$XPERT_PLUGIN_NAME" build
```

在 Xpert host 仓库（如 `xpert` 或 `xpert-pro`）根目录执行组织级安装或重装：

```sh
pnpm plugin:install:local \
  --workspace-path "$PLUGIN_DIR" \
  --org-id "$XPERT_ORG_ID" \
  --token "$XPERT_TOKEN" \
  --api-url "$XPERT_API_URL" \
  --config "$XPERT_PLUGIN_CONFIG_JSON"

pnpm plugin:reinstall:local \
  --workspace-path "$PLUGIN_DIR" \
  --org-id "$XPERT_ORG_ID" \
  --token "$XPERT_TOKEN" \
  --api-url "$XPERT_API_URL" \
  --config "$XPERT_PLUGIN_CONFIG_JSON"
```

若 `XPERT_PLUGIN_CONFIG_JSON` 为空，去掉 `--config "$XPERT_PLUGIN_CONFIG_JSON"`。`plugin:reinstall:local` 会自动构建插件；如需跳过构建，可加 `--skip-build`。

#### 系统级插件

系统级插件使用 `XPERT_INSTALL_SCOPE=global` 和超级管理员登录 JWT。注意：

- `XPERT_TOKEN` 必须是平台登录 JWT，且 token payload 中的 `role` 为 `SUPER_ADMIN`。API key 或不透明 bearer token 可能能认证普通接口，但不能通过 system plugin 安装 guard。
- 可以从浏览器 Network 中复制 header 值 `Bearer <jwt>` 或只复制 `<jwt>`。如果复制了整行 `Authorization: Bearer <jwt>`，执行 curl 前要剥掉 `Authorization:`；传给 host 脚本时建议只保留 `<jwt>` 或 `Bearer <jwt>`。
- 当前部分本地 Xpert host 的 `plugin:install:local` / `plugin:reinstall:local` 脚本强制组织级 header，不适合安装 `meta.level=system` 的插件。此时应直接调用 `POST /api/plugin`，不要携带 `organization-id`，并使用 tenant/global scope。
- 如果安装失败发生在卸载旧实例之后，`/api/plugin/by-names` 可能暂时查不到该插件。修正 token、scope 或 config 后重新调用安装接口即可。

```sh
AUTH_HEADER="${XPERT_TOKEN#Authorization: }"
case "$AUTH_HEADER" in
  Bearer\ *) ;;
  *) AUTH_HEADER="Bearer $AUTH_HEADER" ;;
esac

curl -X POST "${XPERT_API_URL%/}/api/plugin" \
  -H "Authorization: $AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -H "tenant-id: $XPERT_TENANT_ID" \
  -H "x-scope-level: tenant" \
  --data "{
    \"pluginName\": \"$XPERT_PLUGIN_NAME\",
    \"source\": \"code\",
    \"sourceConfig\": { \"workspacePath\": \"$PLUGIN_DIR\" },
    \"config\": $XPERT_PLUGIN_CONFIG_JSON
  }"
```

不同插件的配置结构不同。安装 Sites 时不要复用 Sales Ontology 的 `dataXpert` 配置；Sites 配置应使用：

```json
{"hosting":{"publicBaseUrl":"http://localhost:3000/api/xpert-sites","defaultAccessMode":"workspace_all"}}
```

## 发布流程
1. 本地运行构建、测试和插件生命周期验证。
2. 添加 changeset：`pnpm exec changeset add`
3. 检查待发版计划：`pnpm exec changeset status`
4. 提交代码和 `.changeset/*.md`，发起 PR。
5. PR 合并后，release workflow 会创建或更新 release PR。
6. 合并 release PR 后，workflow 会发布变更包到 npm。

### 首次发布新 npm 包
新包第一次发布时，如果 npm 上还不存在该 package，通常需要维护者先从本地 bootstrap 发布一次。发布完成后再到 npm package settings 中配置 Trusted Publisher，后续版本就走 changeset release workflow。

```sh
PKG=@xpert-ai/plugin-sales-ontology

npm view "$PKG" version || echo "$PKG has not been published yet"
npm whoami
pnpm --filter "$PKG" build
pnpm --filter "$PKG" test
pnpm --filter "$PKG" publish --dry-run --access public --no-git-checks

git status --short
pnpm --filter "$PKG" publish --access public --publish-branch main
```

正式发布前确认 `git status --short` 没有输出；`--no-git-checks` 只用于 dry-run 检查包内容，不用于正式发布。

若账号启用了发布 2FA，在最后一步追加 `--otp <code>`。首次发布 scoped public package 时必须显式使用 `--access public`；若创建时未添加 `--public`，可省略 `--access public` 以私有/受限方式发布。

首次发布后，在 npmjs.com 打开该 package 的 Settings，配置 Trusted Publisher：
- Publisher：GitHub Actions
- Organization/User：`xpert-ai`
- Repository：`xpert-plugins`
- Workflow filename：`release-plugin.yml`
- Environment name：留空，除非 workflow 显式使用 GitHub environment
- Allowed actions：选择 `npm publish`

同时确认 package.json 的 `repository.url` 指向 `https://github.com/xpert-ai/xpert-plugins`，否则 provenance/OIDC 发布可能被 npm 拒绝。

### 手动发布已有包
紧急情况下需要手动发布已有子包时，先确认版本号已经更新并已登录 npm：

```sh
npm whoami
pnpm --filter ./apps/sales-ontology build
pnpm --filter ./apps/sales-ontology publish --access public --publish-branch main
```

发布后检查 npm 页或安装验证：`pnpm add @xpert-ai/plugin-sales-ontology`

## 结构约定
- `tools/`：具体工具实现（如 parser、converter）。
- `apps/`：面向业务闭环的 Agentic App 插件。
- `middlewares/`：请求/响应管线中间件。
- `models/`：模型适配或代理层。
- `packages/`：其他通用包或 agent。
- `scripts/`：仓库辅助脚本（如 create-package）。

## 故障排查
- 路径或导入报错：确认子包 `tsconfig.json` 的 `extends` 指向根的 `tsconfig.base.json`，且 `rootDir` 为 `src`。
- 构建输出缺失：确保子包有 `src/index.ts`，并在 package.json 中 `files` 包含 `dist`。
- 版本/权限异常：检查子包 `publishConfig.access` 与实际发布命令是否一致。
- 系统级插件接口安装失败：确认 `XPERT_TOKEN` 是 `SUPER_ADMIN` 登录 JWT，接口请求没有 `organization-id` header，且 `x-scope-level` 为 `tenant` 或未显式设置组织级 scope。
- 插件配置无效：确认 `XPERT_PLUGIN_CONFIG_JSON` 是当前插件的 config schema，不要把其他插件的示例配置混用。
