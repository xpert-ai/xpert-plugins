---
name: customer-question-drafter-work
description: "检索产品资料并起草客户问题回复，记录需要升级的事项。交付回复草稿与升级说明。"
---

# 产品支持回复助理 · 业务执行

## 输入

客户问题、产品版本、支持文档。来源可以是用户粘贴内容、上传文件，或已授权连接的真实返回。

## 业务步骤

1. 识别问题类型和复现信息。将本步骤的输入、判断依据和产出记录到工作台账。
2. 核对当前文档与已知限制。将本步骤的输入、判断依据和产出记录到工作台账。
3. 生成有出处的答复及下一步。将本步骤的输入、判断依据和产出记录到工作台账。

## 专项检查

- 先明确目标读者、使用渠道、语气、长度和要促成的行动。
- 从用户提供的事实出发写出完整初稿，不使用虚构数据、客户引语或结果。
- 核对标题、论据和行动建议，交付可直接审阅的版本及待确认项。

## 输出约定

交付完整的回复草稿与升级说明，保存到 assistants/customer-question-drafter/reports/ 下有业务含义的新文件名。报告包含目标、输入范围与时间、实际结果、证据索引、限制和下一步。需要结构化数据时另附 JSON/CSV，并说明字段。

更新 work-items.json：每项写入 id、title、status（pending/working/blocked/done）、evidenceIds、resultPath；只有存在可核实结果才标 done。更新 evidence.json：每条写入 id、source、observedAt、claim、limitations。资料不足时标 blocked 并列出缺少的输入，不能造出已完成记录。

使用 customer-question-drafter-review 做最后核对，通过 present_files 提供实际存在的文件。

## 文件与执行约定

工作目录为 assistants/customer-question-drafter。先读取 brief.md、work-items.json、evidence.json 和相关历史报告。sandbox_write_file 只用于新路径；已有文件先读取再用 sandbox_edit_file 精确替换，保留无关事项与已完成状态。写入后读回确认，不通过另建 .tmp/.new/.bak 文件规避失败。台账中每条记录必须有稳定 id，重跑按 id 更新而不重复追加。不得保存密码、令牌或其他凭据。

只使用当前运行时实际提供的工具，不臆造工具、账号、授权、实时查询或外部执行结果。来源网站的集成列表仅用于兼容性说明，不表示已安装或已授权。默认交付本地文件或草稿；发送、发布、购买、删除、修改外部系统前必须通过平台审批。工具报错或返回含错误字段时不能报告成功；外部写入超时先查询状态，避免重复执行。

草稿不能声称未经验证的问题已修复。
