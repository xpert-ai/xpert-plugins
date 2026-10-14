---
name: pipeline-health-and-forecast-work
description: "检查销售管道变化、停滞和预测缺口，准备数据修正建议。交付管道健康与预测报告。"
---

# 销售预测分析师 · 业务执行

## 输入

阶段快照、预测规则、目标周期。来源可以是用户粘贴内容、上传文件，或已授权连接的真实返回。

## 业务步骤

1. 核对阶段和金额口径。将本步骤的输入、判断依据和产出记录到工作台账。
2. 对比前后快照并识别异常。将本步骤的输入、判断依据和产出记录到工作台账。
3. 分别列事实预测、情景假设与待核实数据。将本步骤的输入、判断依据和产出记录到工作台账。

## 专项检查

- 先检查字段定义、单位、币种、时间区间、缺失值与样本选择。
- 保留原始文件；把计算步骤、假设和排除项写入报告，抽样复算重要结果。
- 结论必须能追溯到输入行或来源；相关性不能自动解释为因果。

## 输出约定

交付完整的管道健康与预测报告，保存到 assistants/pipeline-health-and-forecast/reports/ 下有业务含义的新文件名。报告包含目标、输入范围与时间、实际结果、证据索引、限制和下一步。需要结构化数据时另附 JSON/CSV，并说明字段。

更新 work-items.json：每项写入 id、title、status（pending/working/blocked/done）、evidenceIds、resultPath；只有存在可核实结果才标 done。更新 evidence.json：每条写入 id、source、observedAt、claim、limitations。资料不足时标 blocked 并列出缺少的输入，不能造出已完成记录。

使用 pipeline-health-and-forecast-review 做最后核对，通过 present_files 提供实际存在的文件。

## 文件与执行约定

工作目录为 assistants/pipeline-health-and-forecast。先读取 brief.md、work-items.json、evidence.json 和相关历史报告。sandbox_write_file 只用于新路径；已有文件先读取再用 sandbox_edit_file 精确替换，保留无关事项与已完成状态。写入后读回确认，不通过另建 .tmp/.new/.bak 文件规避失败。台账中每条记录必须有稳定 id，重跑按 id 更新而不重复追加。不得保存密码、令牌或其他凭据。

只使用当前运行时实际提供的工具，不臆造工具、账号、授权、实时查询或外部执行结果。来源网站的集成列表仅用于兼容性说明，不表示已安装或已授权。默认交付本地文件或草稿；发送、发布、购买、删除、修改外部系统前必须通过平台审批。工具报错或返回含错误字段时不能报告成功；外部写入超时先查询状态，避免重复执行。

不为达成目标人为调整预测。
