# 运行说明

本文写的是在本地 Xpert 开源版上构建、安装、使用本插件的完整步骤。实际验证用的环境和版本见 [validation.md](validation.md)。

## 环境要求

| 项 | 要求 |
|---|---|
| 平台 | `xpert-ai/xpert` main（验证版本 `199e67a`），已能登录，并配置好一个模型供应商 |
| 插件仓库 | `xpert-ai/xpert-plugins`，本插件在 `community/apps/expedite-shortage` |
| Node | 20.x（验证用 20.20.2）；`corepack enable`，让 corepack 按 `community/package.json` 使用 pnpm 8.15.8 |
| 系统 | Linux 或 WSL2。在 Windows 上要用 WSL2：平台的本地环境脚本靠 `lsof`、`ps` 判断进程，沙箱 NsJail 依赖 Linux |
| 模型 | 任意支持工具调用的对话模型。验证用的是 DeepSeek `deepseek-v4-flash` |

插件本身**不读取任何环境变量**，也不需要任何外部服务的凭证：库存、BOM、在途都来自插件内置的模拟数据。模型凭证在平台网页里配置，不写进插件。

## 1. 构建与测试

```bash
cd xpert-plugins/community
corepack pnpm install --frozen-lockfile

# 界面依赖仓库自带的 shadcn 组件（packages/shadcn-ui，属于 community 工作区），
# 要先构建一次生成 dist（只在构建期用，打进 app.js）
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build

cd apps/expedite-shortage
corepack pnpm typecheck
corepack pnpm test      # vitest，42 个用例
corepack pnpm build     # 打包界面 → tsc → 复制资源 → verify:dist
```

`build` 的最后一步 `verify:dist` 会重新打包一次界面，检查结果和已提交的 `app.js`、`app.css` 完全一致，并检查助手模板、界面资源都复制到了 `dist/`。如果改了 TSX 却忘了重新构建，这一步会报错。

可选：用 harness 检查生命周期（需要先按 `plugin-dev-harness/README.md` 构建 harness；它要求 Node 22 安装，运行时 Node 20 即可）。在插件仓库根目录执行：

```bash
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @xpert-ai/plugin-expedite-shortage
```

预期输出 `ExpediteShortagePlugin dependencies initialized` 和 `Plugin loaded successfully.`。harness 用的是模拟数据库，只能说明模块能装配。

## 2. 安装到平台

本插件是 tenant 级别（`package.json` 里 `xpert.plugin.level: tenant`），并声明了产物命名空间 `expedite_shortage`，平台会自动建出 4 张 `plugin_expedite_shortage_*` 表。

在**平台仓库根目录**执行部署脚本。账号和密码不要写在命令行或文件里，在当前终端里临时设置：

```bash
cd xpert
read -s -p "Xpert username: " XPERT_USERNAME; echo; export XPERT_USERNAME
read -s -p "Xpert password: " XPERT_PASSWORD; echo; export XPERT_PASSWORD

corepack pnpm plugin:deploy:local \
  --plugin-dir ../xpert-plugins/community/apps/expedite-shortage \
  --api-url http://localhost:3000 \
  --scope tenant --tenant-id <你的租户 ID> \
  --skip-build --skip-test

unset XPERT_USERNAME XPERT_PASSWORD
```

- 上面第 1 步已经构建和测试过，所以这里加了 `--skip-build --skip-test`；`verify:dist` 仍然会执行。也可以去掉这两个参数，让脚本自己构建和测试。
- 可以用的环境变量见 [`env.example`](../env.example)，它们都是部署脚本读取的，不是插件读取的。
- 部署成功后提示 `installed and staged successfully. API restart required before activation.`，**要重启 API**。已部署不等于已在运行。
- 插件目录要在平台允许的插件工作区里（source-hybrid 模式下默认包含 setup 时选的工作目录）。

重启后检查：

- API 日志里有 `ExpediteShortagePlugin dependencies initialized`；
- `curl http://localhost:3000/api/health/ready` 返回 200；
- 平台“插件”页面能看到“提前交货缺料分析”，版本 0.1.0；
- 数据库里有 `plugin_expedite_shortage_request`、`_analysis_job`、`_finding`、`_log` 4 张表。

## 3. 创建助手

1. 在平台里从模板“提前交货缺料分析助手”创建助手，选择模型，发布。
2. 画布上应该是 1 个 Agent 和 3 个中间件：上下文压缩、待办清单、提前交货缺料分析（7 个工具）。
3. **递归上限**：模板默认 100。平台按执行图节点计算递归次数，每一轮“模型 → 工具”还要经过两个中间件，一次分析大约要 7 轮工具调用。验证时在“助手设置”里改成了 150，留出余量。如果遇到“已达到递归次数限制”，就调大这个值。

## 4. 使用

1. 进入助手，打开右侧工作台的“提前交货缺料分析”视图。
2. 列表为空时点“载入演示请求”，会建出 3 条草稿：
   - SO-1024：控制柜 X1 × 50，缺 2 项料（主流程）；
   - SO-1031：控制柜 X2 × 20，打开了“第 1 次分析模拟库存系统故障”（失败与重试）；
   - SO-1040：控制柜 X1 × 10，不缺料（可行）。
   也可以点“新建请求”自己填。
3. 选中一条请求，点“AI 分析”。工作台会新开一个会话，把带任务 ID 的分析指令发给智能体。左边对话里可以看到每一次工具调用，一次分析大约 20 秒。
4. 分析完成后状态变为“待确认”。逐条“采纳 / 驳回”，可以填备注；全部决定后填最终交期和说明，点“确认结论”。确认后结论锁定。
5. 如果分析失败，看提示的原因，点“重试”。如果智能体停在半路，30 秒后会出现“放弃本次分析”。没人处理的话，3 分钟后读取时会判为超时。

## 常见问题

| 现象 | 处理 |
|---|---|
| 构建报 `packages/shadcn-ui/dist is missing` | 先在 `community/` 执行 `corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build`（也就是在 `packages/shadcn-ui` 里执行 `pnpm build`） |
| 部署后插件不出现 | 重启 API；查日志里有没有 `ExpediteShortagePlugin dependencies initialized` |
| 分析停在“分析中”，对话里报递归次数限制 | 在“助手设置”里调大递归上限，然后点“放弃本次分析”→“重试” |
| 工作台顶部显示“工作台正在切换会话，请稍后点‘刷新’” | 点“刷新”即可。原因见 [validation.md](validation.md) 的“已知问题” |
| 在 `community/` 里 `pnpm install` 后 lockfile 多出一行 `typeorm ... (ts-node@...)` 的改动 | 这是 pnpm 8 记录共享快照时的不确定性，和本插件无关。还原这一行后用 `--frozen-lockfile` 确认即可 |
