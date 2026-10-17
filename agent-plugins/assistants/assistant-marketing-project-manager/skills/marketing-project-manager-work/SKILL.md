---
name: marketing-project-manager-work
description: "把营销目标拆成研究、文案、页面、投放和分析任务，跟踪验收。交付项目计划与阶段验收表。"
---

# 营销项目统筹 · 业务执行

## 输入

活动目标、交付期限、团队能力和预算。来源可以是用户粘贴内容、上传文件，或已授权连接的真实返回。

## 业务步骤

1. 明确依赖与负责人。将本步骤的输入、判断依据和产出记录到工作台账。
2. 定义每项交付物及检查点。将本步骤的输入、判断依据和产出记录到工作台账。
3. 汇总阻塞并准备人工决策事项。将本步骤的输入、判断依据和产出记录到工作台账。

## 专项检查

- 建立目标、事项、负责人、截止日期、依赖和验收条件。
- 用实际产出和状态记录核对进展，不能把已指派、已发送或无回复等同于已完成。
- 汇总阻塞与需要用户决策的事项，未获授权不替他人承诺或发送消息。

## 输出约定

交付完整的项目计划与阶段验收表，保存到 assistants/marketing-project-manager/reports/ 下有业务含义的新文件名。报告包含目标、输入范围与时间、实际结果、证据索引、限制和下一步。需要结构化数据时另附 JSON/CSV，并说明字段。

更新 work-items.json：每项写入 id、title、status（pending/working/blocked/done）、evidenceIds、resultPath；只有存在可核实结果才标 done。更新 evidence.json：每条写入 id、source、observedAt、claim、limitations。资料不足时标 blocked 并列出缺少的输入，不能造出已完成记录。

使用 marketing-project-manager-review 做最后核对，通过 present_files 提供实际存在的文件。

## 文件与执行约定

工作目录为 assistants/marketing-project-manager。先读取 brief.md、work-items.json、evidence.json 和相关历史报告。sandbox_write_file 只用于新路径；已有文件先读取再用 sandbox_edit_file 精确替换，保留无关事项与已完成状态。写入后读回确认，不通过另建 .tmp/.new/.bak 文件规避失败。台账中每条记录必须有稳定 id，重跑按 id 更新而不重复追加。不得保存密码、令牌或其他凭据。

只使用当前运行时实际提供的工具，不臆造工具、账号、授权、实时查询或外部执行结果。来源网站的集成列表仅用于兼容性说明，不表示已安装或已授权。默认交付本地文件或草稿；发送、发布、购买、删除、修改外部系统前必须通过平台审批。工具报错或返回含错误字段时不能报告成功；外部写入超时先查询状态，避免重复执行。

不能假定存在可调用的专业助手。
