---
title: "HTML 模式协议"
---

# HTML / JavaScript 自由看板

## 数据与展示解耦

平台 Dataset/Binding 和 Analytics Runtime 继续作为唯一数据查询路径。HTML 页面不参与 Provider 选择、凭据处理、SQL 执行或本体 Action 授权。

```text
Agent → 发现/预览 → previewId
      → dashboard_write_html → 授权 Workspace 文件
      → dashboard_create_html → 隔离浏览器预检 → HTML + Controls + Bindings → 同一 ArtifactVersion

HTML iframe → 专属 MessagePort → Live Dashboard View → query-binding
           → 服务端读取保存的版本 → 当前用户权限 → Analytics Runtime → Dataset
```

## 平台接口

`@xpert-ai/plugin-sdk/artifact-document` 是浏览器安全子入口。`mountArtifactDocument` 封装 HTML 格式验证、CSP、script-only sandbox、独立 MessageChannel、Binding ID 白名单、请求限额、销毁和刷新。`installArtifactDocumentFramePolicy` 在专用宿主文档安装 frame-src 策略，禁止子文档自行跳转到外部 URL。

平台不依赖 `live-dashboard`、data-xpert、图表库或任何业务页面。插件可以替换渲染器与数据源，而不复制平台权限和隔离逻辑。

## 插件协议

保存格式沿用 `xpert.live-dashboard/v1`，向后兼容可选字段：

```json
{ "presentation": { "type": "html", "html": "<html>…</html>" }, "charts": [], "tables": [] }
```

HTML 字节、数据 Binding 和 Controls 处于同一内容哈希和版本中。工作区原文件后续编辑不会改变已保存页面。现有 expectedVersionId / CAS、当前用户及 host 归属检查继续适用。

`query-binding` View Action 严格接受 `{artifactId, versionId, bindingId, controls}`。服务端打开对应版本并从中取 Binding。额外的 `binding`、`payload`、`providerId`、`dataSourceId` 均被拒绝。未知 Binding、未知控件、非法值、其他用户/host/组织、已撤销来源权限均不能执行查询。HTML 只能向消息桥提交 bindingId 和 controls；Artifact ID/版本由宿主持有。

## Agent 与浏览器

HTML 模式复用标准看板的 discovery/preview 证据，不允许通过编写 HTML 绕开预览或最终 Provider 策略。`dashboard_write_html` 写文件，`dashboard_create_html` 读取真实文件、验证格式及大小并保存。所有文件访问通过平台 WorkspaceFiles 能力。保存前由 `HtmlDashboardValidation` 检查 Browser Action 与后台执行池健康，将真实默认查询结果和 HTML 放入私有临时文件；队列只携带验证任务 ID。插件 Action 在平台 Browser Runtime 中执行相同的页面宿主，禁用网络，检测初始查询、未声明 Binding、脚本异常和空页面。失败结果返回 Agent，当轮修复后可重试，Artifact 创建发生在校验通过之后。标准 JSON 看板不经过此步骤。

验证任务在 `sandbox-browser` 池执行，使用平台资源限制、超时、取消和销毁。短期任务引用与小型报告存于插件独立 Redis 键（5 分钟 TTL），HTML/数据不进入队列；输入/输出临时文件在完成后删除。保存版本的 metadata 保留 Sandbox Job ID 和已请求 Binding ID。真实数据权限仍由保存/查询时的 Analytics Runtime 重新检查。

页面 SDK：

```javascript
const live = window.xpertLiveArtifact
live.bindSelect(document.querySelector('select'), {
  bindingId: 'sales', controlId: 'region', fieldId: 'region', allLabel: '全部区域'
})
live.subscribe('sales', dataset => render(dataset))
await live.ready()
await live.query('sales', { region: null })
```

页面可以使用任意内联 HTML/CSS/JS、DOM/SVG/Canvas。字段、精度、粒度、单位和完整性来自 Dataset；业务事实不能硬编码在页面里。外部 CDN、fetch/WebSocket、eval、宿主 DOM、Web Storage、嵌套 iframe 和自导航不开放。宿主的查询权限检查独立于前端限制。

页面滤镜触发带控件值的新查询；宿主刷新沿用各 Binding 最近的值，订阅重绘并保留页面状态。同一 Binding 的过期响应不覆盖新响应。保存重开使用固定页面版本并执行最新数据查询。

平台 `bindSelect` 辅助函数负责类型保持的选项填充、保留完整候选值及 change → query，减少 Agent 漏接事件/忘记调用初始化函数的问题。它不带业务语义或页面样式，不增加数据权限。页面负责关联 label 和显示 `xpert-query-error`。

## 验收

已完成真实 xpert-pro + data-xpert SSO 一句话生成、两种样式、筛选、源数据变更后刷新、服务重启后保存重开及查询绕过验收。结果、Artifact/Job ID、截图和限制见 [验收报告](html-acceptance.md)。

## 当前范围

- 单文件 HTML（300 KB）、定义总计 600 KB；8 个 Binding、24 个控件。
- 提供内联原生绘图；第三方图表库可由插件以后通过受控打包提供，当前不开放任意 CDN。
- 刷新为查询最新来源，未提供服务端推送/定时轮询。
- Artifact 当前仍为 owner-only；没有扩大分享权限。
- 保存预检覆盖初始渲染与查询协议；不证明任意图表业务口径、延迟执行分支或所有交互都正确，仍需真实浏览器验收。
- 预检通过平台 Browser Runtime 约束 CPU/内存与时长；用户浏览器中的页面仍不能保证任意 JavaScript 都不会卡顿。后端 Workspace 数据脚本使用独立 Sandbox Jobs。
- HTML 保存要求可用的 Browser Runtime Provider 和执行池；不提供 API 进程内执行或权限放宽的降级。
