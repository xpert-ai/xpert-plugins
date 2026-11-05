# RFID Experiment Insight MVP

来源：参考会话 `6aac9148-13a4-83ea-abdf-96f1a5cebf0a` 的产品定义；沿用既定方向。

目标用户：已完成实验、取得结构化结果 CSV 的 RFID / 无线感知算法工程师和研究人员。
解决重复统计、数字与解释分离、分析记录难以恢复的问题。

## 固定闭环

上传实验结果 CSV → 校验 → 确定性统计 → Assistant 真实 LLM 解释 → 用户查看/确认 → 保存 → 刷新恢复。
AI 失败保留统计，Retry 只重新执行 AI 阶段，不创建重复分析记录。

## 职责边界

- Service/Tool：校验、计算、持久化、作用域、并发和状态控制。
- Middleware：严格 Tool schema，向 Assistant 提供统计和结果保存，处理模型异常。
- Assistant Template：绑定 Middleware，由宿主配置真实模型，解释结构化统计。
- Workbench/ViewProvider：上传、将分析请求转交 Assistant、查询、人工确认、失败重试。
- Entity：`ExperimentAnalysis`。只有一个主要业务实体。

AI 输出四段：Overall Trend、Most Degraded Condition、Signal Quality Observation、Suggested Follow-up。
模型不计算统计、不伪造数字、不将相关现象断言为因果机制。

状态：`DRAFT / ANALYZING / COMPLETED / FAILED`；人工确认以 `confirmedAt` 标记。
持久化数据包括原始结果行、datasetSummary、statistics、aiSummary、errorMessage 和尝试标识。

## 页面

一个 Workbench：左侧 History，右侧上传/当前分析；展示记录数、平均准确率、最佳/最差条件、性能变化及 AI 解释。
操作：Upload CSV、Analyze Experiment、Confirm and Save、Retry。Remote Component 与 ViewProvider 注册已实现；统计只由后端生成，浏览器仅格式化展示。

## 不做

原始 RFID 时序处理、模型训练、复杂 Dashboard、RAG、多智能体、复杂权限、PDF、实时设备接入、因果诊断。
仍须保留租户、组织、工作空间/项目和用户隔离，所有作用域取自宿主上下文，不能由 Tool 参数提供。

## 完成标准和当前状态

- 已实现并本地测试：CSV 校验、统计、Tool/Assistant Template、持久化接口、复核边界、失败/Retry、并发及过期保护。
- 已验证：构建产物、14 项后端测试、9 项 React UI/mock 集成测试和 plugin-dev-harness 生命周期。
- 待验证：真实数据库保存/刷新恢复、宿主 Assistant 的真实 LLM 调用。
- 已实现：Remote Component 和 ViewProvider 注册，本地预览支持成功、失败、Retry、人工确认与重开恢复。
- 待验证：真实宿主 Remote Component 协议、Assistant 调用与完整闭环；待用户补充宿主配置后执行。

限制：本轮 repository 是内存测试替身，生命周期使用 mock；不能据此宣称整个 MVP 或真实 AI 链路已经交付。
