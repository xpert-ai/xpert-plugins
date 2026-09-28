# 旅行方案工作台

旅行方案工作台是一个运行在 Xpert 上的业务应用插件，面向旅行顾问、差旅协调人员和需要快速整理出行方案的业务用户。它把“收集需求 → AI 生成行程 → 人工审核 → 确认保存”做成一条可恢复的业务流程。

## 核心流程

1. 用户在旅行方案助手中提供目的地、日期、人数、预算和偏好。
2. `travel_create_plan` 保存一条旅行需求，返回稳定的 `planId`。
3. Assistant 根据需求生成结构化每日行程，先调用 `travel_validate_itinerary` 检查时间冲突和预算，再调用 `travel_generate_itinerary` 保存结果。
4. 用户在 Travel Planner Workbench 中查看行程，确认后调用 `travel_confirm_plan`。
5. 刷新工作台或重新进入助手时，方案和状态从 TypeORM 表中恢复，而不是依赖浏览器内存。

生成失败时，方案会进入 `failed` 状态并保存原因。用户可以复用原有 `planId` 重试，不会重复创建业务记录。

## 业务状态

| 状态 | 含义 |
| --- | --- |
| `draft` | 已保存旅行需求，等待生成 |
| `generating` | 正在准备生成结果 |
| `ready_for_review` | AI 已生成，等待人工审核 |
| `confirmed` | 用户明确确认并保存 |
| `failed` | 校验或生成失败，可以重试 |

## 插件能力

- `travel_create_plan`：创建旅行需求。
- `travel_generate_itinerary`：保存 Assistant 生成的结构化行程。
- `travel_validate_itinerary`：校验日期、时间顺序、重复日期和预算。
- `travel_confirm_plan`：在用户明确确认后将方案置为已确认。
- 工作台的“允许重试”会复用原方案 ID，将失败状态恢复为 `draft`，再由助手重新生成，不会创建重复方案。
- `Travel Planner Workbench`：查看历史方案、状态、每日活动和失败原因。
- `旅行方案助手`：可从应用模板创建的 Assistant。

## 本地构建

在插件仓库的 `community` 工作区执行：

```bash
pnpm nx build travel-itinerary
pnpm nx test travel-itinerary
```

如果使用 Xpert 本地平台，先完成宿主初始化，再按平台版本执行本地部署脚本。部署后重启测试平台，创建“旅行方案助手”，绑定 Travel Planner Workbench 和 `travel-itinerary` middleware，使用真实模型完成一次生成和确认。

## 验收清单

- [ ] 插件入口可加载，配置可校验，模块可初始化和销毁。
- [ ] Assistant 模板可以展示并创建。
- [ ] 用户输入缺少目的地、日期或人数时得到可理解的校验提示。
- [ ] 真实模型生成结构化行程，并在工作台展示。
- [ ] 确认后刷新页面仍能恢复已确认方案。
- [ ] 模拟生成失败后显示原因，使用原 `planId` 重试且不产生重复记录。
- [ ] 业务数据按 tenant 和 organization 范围隔离。

## 取舍与限制

第一版不连接机票、酒店、支付或实时景点 API，不声称完成预订；实时价格、营业时间和交通状态仍需用户核实。不包含多智能体协作、多人协同编辑和复杂权限管理，以保证面试场景中的最小完整闭环可靠可演示。

## 复用来源

插件结构参考 `xpert-ai/xpert-plugins` `community/apps/crm` 的 Workbench、Agent middleware、Assistant template 和 TypeORM 组织隔离模式。远程工作台的消息桥接遵循 Xpert Remote Component protocol v1；旅行业务对象、工具描述、状态机和界面由本插件新增。

## 截图

平台实际运行截图应在完成 Xpert 安装、Assistant 创建和真实模型调用后补充到此处，使用本目录内的相对路径，例如：

```markdown
![旅行方案工作台](./docs/images/travel-workbench.png)
```
