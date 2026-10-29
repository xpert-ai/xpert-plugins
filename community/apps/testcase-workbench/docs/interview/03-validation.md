# 03 · 验证记录（四层）

按"业务逻辑 → 插件加载 → 界面集成 → 平台业务流程"四层记录。已执行项给出命令与结果；未在测试平台执行的项如实标注"待验收"，不写"通过"。

## 第 1 层 · 单元测试与构建检查（本机已执行 ✅）

命令：

```bash
node --import tsx --test tests/workbench.test.ts
node scripts/build-remote.mjs && node scripts/build-remote.mjs --check
```

结果：`tests 11 / pass 11 / fail 0`；远程构建产物 `dist/remote/testcase.html`（≈16.8 KB 自包含）生成成功，`--check` 报告"Remote HTML and Assistant template match source"（无过期产物、内联模块语法校验通过）。

覆盖的业务断言（不是只验证函数被调用，而是校验业务结果）：

| # | 断言 | 对应题目点 |
| --- | --- | --- |
| 1 | 空状态：无需求无返回空数组与 `revision 0` | 输入与空状态 |
| 2 | 保存需求后，新建同库 store 能读回（非内存） | 保存与恢复 |
| 3 | 标题/描述为空被 `invalid_input` 拒绝且不写库 | 输入与空状态 |
| 4 | 过期 `expectedRevision` 报 `conflict` 且保留旧值 | 失败与重试 |
| 5 | 并发首次保存一胜一冲突（唯一键保护） | 失败与重试 |
| 6 | 未保存需求时生成草稿报 `not_found` | 权限与数据范围/前置 |
| 7 | 生成草稿→确认为 `confirmed`，只动选中项 | 完整业务流程 |
| 8 | 同 `requestId` 重放不重复入库（`reused`，条数不变） | 失败与重试（幂等） |
| 9 | 丢弃删除草稿；确认未知 id 报 `not_found` 不写库 | 完整业务流程 |
| 10 | 五个作用域维度任一不同即数据隔离 | 权限与数据范围 |
| 11 | 跑完整闭环后文档仍符合声明的 zod schema | 数据一致性 |

> 说明：`workbench-store.ts` 为框架无关业务层，故单测用内存版持久化端口即可真实驱动上述规则；生产端口 `TypeOrmWorkbenchPort` 复用同一 store，行为一致。

## 第 1.5 层 · 类型检查与完整构建（本机已执行 ✅）

在完整依赖（`@xpert-ai/plugin-sdk@3.18.5`、`@xpert-ai/contracts`、`@nestjs/*`、`typeorm@0.3.24`、`zod@3.25.67`、`typescript@5.9.2`）下执行：

```bash
tsc -p tsconfig.json --noEmit          # 服务端：0 error
tsc -p tsconfig.remote.json --noEmit   # 远程界面：0 error
node scripts/clean-dist.mjs && tsc -p tsconfig.json && node scripts/build-remote.mjs
```

结果：服务端与远程界面 `tsc` 均 0 错误；`tsc` 产出 `dist/index.js` + `dist/lib/**`（含 `.d.ts`），`build-remote` 产出 `dist/remote/testcase.html`（≈16.8 KB）与 `dist/testcase-assistant.yaml`。即插件在跨 SDK 类型下可编译，产物入口/界面/模板齐全。

## 第 2 层 · 插件生命周期测试（⏳ 待平台/工作区执行）

命令（插件仓库根，`plugin-dev-harness` 先按 README 准备并构建）：

```bash
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @community/apps-testcase-workbench
```

关注：入口可加载、配置可校验、初始化与销毁无错误。**注意**：harness 自带数据库/运行能力模拟对象，据此通过**不能**宣称真实数据库、权限或业务流程已通过。本会话未运行该工具，属待验收项。

## 第 3 层 · 界面与平台业务流程测试（⏳ 待验收）

需真实构建的界面资源验证表单、状态、数据查询与动作桥接，再装入 Xpert 走通 02 的六步。可用浏览器自动化重复关键流程。当前**尚无平台内运行截图**；README 的 `docs/images/` 为占位说明，不以原型图充当运行证据。

## 场景对照（题目验收表）

| 场景 | 本机状态 | 平台待办 |
| --- | --- | --- |
| 完整业务流程 | 业务规则单测通过 | 需真实模型调用+助手运行验收 |
| 保存与恢复 | 单测（读回非内存）通过 | 刷新重进的真实验收 |
| 输入与空状态 | 校验+空态单测通过 | 界面提示走查 |
| 失败与重试 | 冲突/幂等单测通过 | 真实模型失败演示 |
| 权限与数据范围 | 五维隔离单测通过 | 多用户真实隔离验证 |

## 执行环境与可复现信息

- 本机 Node v26、npm 11；单测经 `tsx@4.20.5` 运行，`zod@3.25.67`。
- 基线与复现命令见 [02-runbook](02-runbook.md) 与 [05-sources](05-sources.md)。
- 明确标注：第 2、3 层为**未验证部分**，模型输出为真实调用时才计入，不使用模拟响应冒充业务通过。
