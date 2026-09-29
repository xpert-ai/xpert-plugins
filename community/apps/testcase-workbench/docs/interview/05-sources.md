# 05 · 来源、许可与 Git 状态

## 版本基线（开始开发时记录）

| 仓库 | 分支 | commit SHA（本机获取时间 2026-09-16） |
| --- | --- | --- |
| `xpert-ai/xpert`（平台，开源版） | `main` | `182f2f4a7d05d968016a9ec20a93833687c4394f` |
| `xpert-ai/xpert-plugins`（插件） | `main` | `03de3fefa289fb32e9f53c967a1427ba07f1be0e` |

`@xpert-ai/plugin-sdk` / `@xpert-ai/contracts` 当时 npm `latest`：`3.18.5`；本插件 peer 声明 `^3.18.4`，Node 侧按工作区配置（`pnpm@8.15.8`）。开发、测试与 PR 均以这两条 `main` 基线为准；实际测试版本（平台/插件）随 PR 附上。

## 参考与复用范围

- **参考（未复制代码）**：`community/apps/dockyard` 用于理解插件入口、`ViewExtensionProvider`、`AgentMiddlewareStrategy`、`templates.ts`、助手 YAML 与 `plugin:deploy:local`/`plugin-dev-harness` 约定；本作品业务选题、数据模型、界面与逻辑均为自写。
- **公共依赖**：仅 `@xpert-ai/plugin-sdk`、`@xpert-ai/contracts` 提供的公开 API（`pluginArtifactTableName` 等），以及 `@nestjs/*`、`typeorm`、`zod`、`@langchain/core`（`tool`）。未捆绑任何第三方编辑器/前端库，无 `vendor/`。
- **许可**：AGPL-3.0，与 `community/apps` 约定一致。详见 [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md)。
- **凭证**：全部走环境变量/平台配置，见 [deploy.env.example](deploy.env.example)；材料中不含真实密钥、私人信息。

## Git 交付流程（Fork → 功能分支 → PR）

```bash
# 1. Fork xpert-ai/xpert-plugins 到个人账号，添加上游
git remote add upstream https://github.com/xpert-ai/xpert-plugins.git
# 2. 从上游 main 建独立功能分支
git fetch upstream && git checkout -b feat/testcase-workbench upstream/main
# 3. 放置插件并按含义提交
#    community/apps/testcase-workbench/...
git add community/apps/testcase-workbench
git commit -m "feat(testcase-workbench): AI test-case workbench as an Xpert agentic app plugin"
# 4. 推功能分支并向 上游 main 发 PR（不合并）
git push -u origin feat/testcase-workbench
```

提交保持目的单一、无无关改动/临时文件/构建产物（`dist/`、`node_modules/` 已在 `.gitignore`）/敏感信息。PR 描述含产品价值、主要实现、验证结果、基线 SHA 与复现命令，并链接本目录各文档；运行截图待平台验收后放入插件 `README` 的相对路径图片。

## 本会话执行状态说明（诚实标注）

- 本机已验证：单测 11/11、跨 SDK `tsc` 0 error、`build` + `verify:dist` 通过。
- **未执行**：Fork/推送/开 PR 需候选人个人 GitHub 与对 `xpert-plugins` 的权限；插件生命周期 harness、平台内安装与真实模型业务流程需在测试平台完成。以上不冒充"已完成"。
