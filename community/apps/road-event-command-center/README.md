# 道路事件智能指挥中心

这是基于 Xpert 业务应用插件机制开发的面试项目，采用 Vue 3 + TypeScript Remote View 与 Xpert 插件后端。

## 已完成：S1 事件草稿闭环

- 值班人员填写事件标题、类型、初步等级、地点描述、事件情况和发生时间。
- 前后端共享 Zod 结构校验，后端拒绝未知字段和超出长度/枚举范围的数据。
- 通过 Xpert Remote Component 宿主消息请求读取和保存，不从 iframe 直接调用 API。
- 后端按租户、组织、工作区、用户及 Assistant 范围保存到 Xpert 插件数据库记录。
- 插件按当前本地环境安装在 tenant 范围（同一租户内可见）；草稿仍按上述宿主上下文隔离，不因安装范围变成跨组织共享数据。
- 使用 revision 乐观锁拒绝旧页面覆盖新版本；刷新后从平台读取已保存草稿。
- 界面展示保存成功/失败、版本、最后保存时间，并允许重新读取。

S1 已在 Xpert Cloud 中验证保存和刷新恢复。本阶段不包含派单、人工确认及后端 HTTP API。

## 已完成：S2 地图定位

- 使用 OpenLayers 加载天地图矢量底图和中文注记，点击地图后记录 WGS84 经纬度并显示标记；OpenStreetMap 瓦片已移除。
- 没有已保存坐标时默认显示南京市栖霞区附近；已有草稿坐标时优先回到草稿位置。
- 支持手动编辑经纬度；经纬度是选填项，地点描述始终保留。
- 底图不可用时显示提示，仍可手动输入坐标并保存；旧版 S1 草稿（没有坐标字段）继续兼容。
- 坐标与事件草稿一起保存到平台数据库，刷新后从宿主数据接口恢复。

S2 已在 Xpert Cloud 中验证天地图加载、选点、坐标持久化和刷新恢复。本阶段不包含派单或人工确认。

## 已完成：S3 结构化 AI 建议与失败状态

- Assistant 通过 `generate_road_event_recommendation` 工具读取当前已保存草稿。
- 工具使用当前 Assistant 配置的聊天模型，通过 Xpert runtime 创建模型客户端；不另存模型密钥。
- 模型以结构化 schema 输出建议摘要、建议等级、行动项和注意事项，随后与草稿一起持久化。
- 工作台展示建议、使用的模型和生成时间，并明确标记为待人工审核。
- 失败时保留原草稿并持久化失败状态；工作台显示失败提示，值班人员可在对话中明确要求重试。模型调用仍由 Assistant 工具完成。
- 不自动派单，不执行外部操作。

在 Cloud 的 Assistant 对话中要求生成建议；若模型调用失败，工作台重新读取后应显示失败状态。用户明确要求重试时，Assistant 再调用同一工具。成功后返回工作台重新读取并确认建议持久化。

## 本地检查预览

在 WSL Ubuntu 中运行：

    cd ~/xpert-plugins-sparse/community/apps/road-event-command-center
    cp .env.example .env.local
    # 在 .env.local 中填写 VITE_TIANDITU_TOKEN
    pnpm run dev:preview

然后在 Windows 浏览器打开 http://localhost:4175/preview.html。该页面使用沙箱 iframe 和本地宿主模拟器，数据保存在宿主页面当前标签页的 sessionStorage，可检查表单和地图交互；它不代表平台数据库持久化。

天地图 Token 需自行从天地图开发平台申请。Token 会随浏览器地图请求发送，因此应在控制台限制可用来源和调用配额；`.env.local` 已加入忽略，不要将真实 Token 提交到仓库。

Xpert 中正式安装后，插件会通过平台数据库持久化草稿。正式安装、刷新恢复及不同用户/Assistant 隔离仍需在运行中的 Xpert 实例验收。

## 在本地 Xpert 中验收 S1/S2

安装并加载插件后，在目标组织的 Xperts 页面从“道路事件草稿助手”模板创建 Assistant。模板已连接 `road-event-command-center.workspace` middleware，该 middleware 声明道路事件工作台能力，并提供结构化建议工具。

打开新建 Assistant 左侧的“Road Events / 道路事件”入口，在表单填写标题、事件类型、等级、地点描述、事件情况和发生时间；再点击地图选一个位置，或手动输入经纬度，然后保存草稿。确认坐标、成功提示、版本和保存时间后刷新页面，事件字段和地图标记应从平台 PostgreSQL 恢复。底图不可用时，手动输入坐标仍应可保存。真实验收必须使用 Xpert Cloud 界面，不能用 `4175/preview.html` 的 `sessionStorage` 预览代替。

## 后续最小闭环切片

1. S4 人工确认闭环：确认建议并持久化确认结果，刷新后恢复；明确记录人工确认者与时间。
2. S5 完整验收：单测、类型检查、构建、plugin-dev-harness 生命周期测试，以及真实平台安装和模型调用验收。

每个切片独立完成设计、实现、测试和复查后再进入下一项。
