# RFID Experiment Insight

无线感知实验智能分析助手。将实验结果 CSV 转换为确定性统计，由 Xpert Assistant 的真实模型解释，用户复核后确认保存。

## 当前检查点：Workbench UI 与本地验证已完成

- 一个 `ExperimentAnalysis` 实体，保存数据、统计、AI 解释、状态和人工确认时间。
- CSV 校验、按条件分组统计、上传幂等、同记录重试、并发保护、过期恢复。
- Middleware Tools：`analyze_experiment`、`save_analysis`、`get_analysis`。
- Assistant Template 已注册；实际使用时需在宿主为 Assistant 配置可用模型。
- Workbench ViewProvider 的服务端上传、消息准备、查询、确认及发送失败接口已实现并测试。
- ViewProvider 已注册，Remote Component 提供 History、CSV 上传、统计、Assistant 分析、Retry 和人工确认。
- 不在 Service 中创建模型客户端或直接请求模型。保留以下调用链：

```text
Workbench upload → ViewProvider → Service → Repository
Workbench Analyze/Retry → ViewProvider.prepareAnalysis → assistant.chat.send_message
Assistant → analyze_experiment → Service 返回确定性统计
Assistant LLM 解释 → save_analysis → Service 保存 AI 解释（未人工确认）
Workbench Confirm and Save → ViewProvider → Service.confirmAnalysis
Workbench reload → ViewProvider → Service → Repository
```

## 构建和验证

在仓库根目录进入 `community`，使用 workspace 指定的 pnpm 8.15.8：

```powershell
cd community
npx --yes pnpm@8.15.8 --filter @xpert-ai/plugin-rfid-experiment-insight... install --no-frozen-lockfile
npx --yes pnpm@8.15.8 --filter @xpert-ai/plugin-rfid-experiment-insight build
npx --yes pnpm@8.15.8 --filter @xpert-ai/plugin-rfid-experiment-insight test
```

构建清理本包 `dist`，生成 `dist/index.js`、声明文件、服务端模块、Assistant YAML 及 Remote Component 资源。

回到仓库根目录执行生命周期验证：

```powershell
npx --yes pnpm@8.15.8 -C plugin-dev-harness --ignore-workspace install --no-frozen-lockfile
npx --yes pnpm@8.15.8 -C plugin-dev-harness --ignore-workspace build
node plugin-dev-harness/dist/index.js --workspace ./community --plugin @xpert-ai/plugin-rfid-experiment-insight
```

若 Node 22+ 出现 README 所述依赖初始化问题，按 `plugin-dev-harness/README.md` 使用 Node 20。

验证记录：Node 24.16.0 + pnpm 8.15.8，构建通过，23 项测试通过（原有 14 项后端 + 9 项 UI），harness 的加载、启动、bootstrap、destroy、stop 和关闭通过。
UI 测试运行实际 React 页面、ViewProvider、Middleware 和 Service，使用内存 repository 和模拟模型响应；harness 使用 TypeORM/runtime mock。
这些结果不代表真实数据库迁移、真实模型调用或宿主端到端验收已经完成。

本地浏览器预览（从 community 执行）：

```powershell
npx --yes pnpm@8.15.8 --filter @xpert-ai/plugin-rfid-experiment-insight preview:mock
```

打开 `http://127.0.0.1:4177`。页面明确标注 Mock，可模拟成功、模型失败、发送失败及重开工作台。数据仅保存在预览进程内存，停止进程即丢失；不需要 `.env`，不连接真实模型。

## 输入与统计约定

参考 `examples/experiment-results.csv`。UTF-8 CSV，恰好 7 个字段：

```csv
experiment_id,distance_m,angle_deg,environment,accuracy,rssi_std,phase_dispersion
run_001,1.5,0,Env-1,0.954,2.1,0.06
```

- 最大 1 MiB / 10,000 条；experiment_id 唯一且非空，environment 非空。
- accuracy 为 0–1；distance_m、rssi_std、phase_dispersion 非负有限数；angle_deg 为 -360–360。
- 相同 `(distance_m, angle_deg, environment)` 的多轮实验合并计算算术平均。
- 全局准确率按原始记录计算，最佳/最差按条件组平均准确率比较。
- `accuracy_drop_vs_best` 为最佳减最差的绝对准确率差，乘 100 后展示为百分点。
- 信号变化为最差条件均值减最佳条件均值；不作因果结论。
- 平局按距离、角度、环境名称顺序确定代表条件；完整 conditions 仍保留所有组。

## 状态、失败和恢复

`DRAFT → ANALYZING → COMPLETED`；失败为 `FAILED → Retry → ANALYZING`。
COMPLETED 表示 AI 解释可供复核；只有显式人工确认才写入 `confirmedAt`。
上传即持久化输入及统计，AI 解释随后持久化，因此失败或刷新不丢失已有统计。

每轮分配 `attemptId`，并发开始只允许一轮成功，旧轮结果不能覆盖新轮。
Middleware 在读取统计后的模型异常或未保存结果就结束时标记 FAILED。
模型在第一次 Tool 之前失败、请求未送达或进程中断时，通过 120 秒持久化期限在下次查询/操作时转为 FAILED。
UI 监听 Tool 完成事件并每 3 秒轮询处理中记录，发送命令失败时调用 `report_dispatch_failure`；重试更新原分析 ID。

## UI 调用边界与待验证项

1. `rfid_experiment_insight__remote/app.js` 构建时复制到 dist，ViewProvider 和 view capability 已注册。
2. 上传通过 `executeFileAction('upload_csv')`；传 `requestId` UUID 和 name，文件失败重传复用同一 requestId。
3. Analyze/Retry 的 action 返回 `PreparedAnalysis`；按 `command.type` 显式分支，通过 `invokeClientCommand` 转交 `assistant.chat.send_message`。
4. 使用 `analysisId` 查询并轮询，展示四段 AI 解释，让用户调用确认 action。
5. 真实宿主安装遵守仓库 `AGENTS.md`：从 `community/.env` 读取配置，system plugin 使用 SUPER_ADMIN 登录 JWT 和全局安装范围。

真实宿主配置尚不可用，安装、真实数据库恢复、实际 Remote Component 协议兼容性及真实模型闭环保留为待验证项。更完整的 MVP 边界见 `docs/requirements.md`。
