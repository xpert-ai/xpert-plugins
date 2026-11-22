# 截图

本目录存放 README 引用的运行截图。图片随代码提交，README 用相对路径引用，在 GitHub 上直接显示。

## 需要的文件

按下表命名保存，README 的引用会自动生效。

### Xpert 平台内

| 文件名 | 内容 |
| --- | --- |
| `xpert-plugin-loaded.png` | 插件列表中的 Resume Screening Assistant 卡片，含版本号、`全局` 徽章与能力标签 |
| `xpert-plugin-components.png` | 插件详情对话框，含助手模板 / 应用 / 视图 / 中间件工具四类组件 |

### 业务流程

| 文件名 | 内容 |
| --- | --- |
| `workbench-job.png` | 新建岗位：JD 与硬性筛选标准 |
| `workbench-candidates.png` | 候选人排序列表：分数、匹配理由、复核按钮 |
| `workbench-detail.png` | 候选人详情：结构化字段、匹配建议、面试问题 |
| `workbench-failure.png` | **异常情况**：文本乱码导致解析失败，给出原因与重试入口 |

## 截图来源需如实标注

README 中已分别标注两组截图的来源：

- **平台内**（前两张）：Xpert 实际运行界面
- **业务流程**（后四张）：本地预览 `tools/remote-view-preview` 配合真实模型调用

平台内的端到端流程未完成，原因见 [../platform-issues.md](../platform-issues.md)。
两类截图不可混标。

## 提交前检查

- [ ] 截图中没有真实 API Key（本地预览右侧面板的 `API Key` 输入框建议裁掉）
- [ ] 截图中没有候选人手机号等联系方式
- [ ] README 中的引用路径与实际文件名一致
