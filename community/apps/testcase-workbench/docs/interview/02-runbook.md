# 02 · 运行说明（环境 / 构建 / 安装 / 配置 / 使用）

命令为 Xpert 平台专用；基础 Git、依赖安装与常规构建自行完成。`<>` 为占位符，脚本以工作区 `package.json` 为准。Node.js 与包管理器版本以仓库配置为准（本插件 `packageManager` 锁 `pnpm@8.15.8`）。

## 0 版本基线（复现用）

开始开发时获取并记录两仓 `main` 的 commit SHA（详见 [05-sources](05-sources.md)）：

- 平台 `xpert-ai/xpert` @ `main`：`182f2f4a7d05d968016a9ec20a93833687c4394f`
- 插件 `xpert-ai/xpert-plugins` @ `main`：`03de3fefa289fb32e9f53c967a1427ba07f1be0e`
- `@xpert-ai/plugin-sdk` 当时 `latest`：`3.18.5`（本插件 peer 声明 `^3.18.4`）

作品仅使用开源版能力，不依赖商业版专属功能。

## 1 准备平台与 Fork

1. 按官网指南以本地源码方式跑起 Xpert 开源版，配好数据库、模型和**有插件安装权限的测试账号**；记录实际 commit SHA。
2. Fork `xpert-ai/xpert-plugins`，从上游 `main` 建独立功能分支，例如：
   ```bash
   git checkout -b feat/testcase-workbench upstream/main
   ```
3. 把本目录放到 `community/apps/testcase-workbench/`。

## 2 安装依赖与构建

在插件仓库根（或 community 工作区）：

```bash
corepack enable
pnpm install
pnpm --filter @community/apps-testcase-workbench build   # tsc(服务端) + 生成 dist/remote/testcase.html + 复制助手模板
pnpm --filter @community/apps-testcase-workbench test     # build + 单测 + verify:dist
```

产物：`dist/index.js`（服务端入口）、`dist/lib/**`、`dist/remote/testcase.html`（自包含界面）、`dist/testcase-assistant.yaml`（模板）。

## 3 部署到测试平台

在**宿主（平台）根目录**执行平台专用部署命令，安装范围须匹配插件声明（`level: tenant`）：

```bash
corepack pnpm plugin:deploy:local --help
corepack pnpm plugin:deploy:local \
  --plugin-dir <plugin-repo-root>/community/apps/testcase-workbench \
  --scope <tenant-or-organization> --api-url <api-origin>
```

若提示需重启，重启测试宿主后再验证。远程宿主必须能访问插件产物，不能用个人电脑上的本地路径。环境变量示例见 [deploy.env.example](deploy.env.example)；凭证一律走环境变量/平台配置，材料中不含真实密钥。

## 4 初始化助手并验证加载

安装插件 ≠ 助手已可用。按下列步骤确认真实业务链路：

1. 重启平台后，在插件/应用列表能看到"AI 测试用例工作台"。
2. 从助手模板"测试用例设计助手"创建 Assistant，绑定一个可用模型并发布。
3. 打开该 Assistant 的工作台，出现"测试用例"视图（Workbench）。
4. 助手已挂载 `testcase_persist_draft` 工具（中间件"测试用例工作台"为必需项）。

## 5 走通一次业务流程

1. 工作台填需求（如"用户可用正确凭据登录"），保存 → 状态"已保存"，列表显示空态"暂无用例"。
2. 点"AI 生成用例" → 引用带入聊天，补充一句"覆盖成功、密码错误、边界三种"发送。
3. 助手产出结构化用例并写库 → 工作台出现 3–8 条**草稿**（含步骤/预期/优先级）。
4. 勾选后点"确认选中" → 变"已确认"。
5. 刷新或重进应用 → 需求与已确认用例从数据库读回（保存与恢复）。
6. 制造一次失败：把模型额度置 0 或断网后点"AI 生成用例"发送，或提交一个过期 `expectedRevision` → 界面给出可理解提示与"重试"；重试用同一 `requestId` 不重复生成（失败与重试）。

每步都记录"操作 / 预期 / 实际结果"，写入 [03-validation](03-validation.md)。
