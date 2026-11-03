# 缺陷受理与澄清工作台

面向测试与技术支持，把零散用户反馈整理为可核对、可保存、可恢复的缺陷报告。使用 Xpert 的组织身份、领域中间件、Workbench Remote View 和 PostgreSQL 持久化，作为独立插件开发。

当前实现为第一阶段：原始反馈录入、人工补充、报告编辑、草稿保存、人工确认快照、搜索分页与重新打开恢复。**尚未实现 AI 提取、追问及分析重试**；界面明确显示此阶段范围。未知字段保持空白，确认仅表示人工核对。

![本地 Xpert 中的工作台](docs/images/phase-one-workbench.png)

## 本地开发

从本仓库的 `community` 工作区运行，使用其指定的 pnpm 版本：

```sh
corepack pnpm --filter @community/apps-defect-intake... install --frozen-lockfile
corepack pnpm --filter @community/apps-defect-intake build
corepack pnpm --filter @community/apps-defect-intake test
corepack pnpm --filter @community/apps-defect-intake verify:dist
```

React 控件使用同仓库共享的 `@xpert-ai/plugin-shadcn-ui`。构建先生成共享 UI，再检查服务端与远程组件类型并生成独立 JS/CSS。运行包不依赖源码目录、共享 UI 源文件或 CDN。SDK 与契约使用已发布的 3.30.2 版本，SDK 为宿主提供的 peer dependency。

## 安装和入口

插件声明为 `system`，在 Default tenant 以 tenant scope 安装。通过所选 Xpert 宿主的 `plugin:deploy:local --plugin-dir <本插件目录> --scope tenant` 安装，凭证使用宿主支持的 Keychain 或当前进程环境变量；按部署结果重启 API。不要手工修改宿主插件暂存目录。

在组织工作空间安装本插件提供的“缺陷受理与澄清助手”模板，选择可用且已获授权的模型，再发布到本地组织。打开助手菜单中的“缺陷受理”。模板已连接领域中间件、Todo 和 Context Compression；第一阶段领域中间件只提供工作台激活特性，不提供业务写入工具。

安装插件、安装模板、发布助手是三个独立步骤。模板不包含实际租户、组织、用户、模型连接 ID 或密钥。

## 验证

`test` 检查输入边界、未知信息、人工确认门槛、翻译目录及模板的跨层一致性；`verify:dist` 重新生成并比较正式远程资产。仓库 `plugin-dev-harness` 用实际 dist 进行加载与生命周期检查，其数据库 mock 不代表持久化通过。

真实平台验收脚本为 `tests/live.mjs`。先在当前进程配置 `XPERT_USERNAME`、`XPERT_PASSWORD`、`XPERT_ORG_ID`、`XPERT_ASSISTANT_ID`，可选 `XPERT_API_URL`（默认 `http://localhost:3000/api`），然后执行 `node tests/live.mjs`。脚本仅允许 loopback 地址，会留下明确标记的虚构验收记录；凭证、JWT 和部署身份不写入源码或输出。

模拟宿主使用正式资产与单独的 fixture：在仓库根目录运行 `node tools/remote-view-preview/cli.mjs --config community/apps/defect-intake/preview.config.mjs --port 4417`。这是模拟交互验证，不等同于真实平台数据库验收。

实际验证范围与阶段边界见 [第一阶段记录](docs/phase-one.md)，需求和后续验收见 [产品规格](docs/product-spec.md)。
