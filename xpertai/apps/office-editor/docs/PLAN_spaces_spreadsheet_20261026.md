# Spaces Spreadsheet 接入计划

## 目标与范围

复用 office-editor 0.5.1 的 Univer 0.25.0、OfficeDocument/OfficeSnapshot、文件基础设施和 Assistant 工具。新增 Project 原生 Spreadsheet 资源，不新增插件，不升级 Univer，不引入 Pro。Docs、Slides、既有 XLSX 文件编辑保留。

## 当前源码结论与数据决策

- 原生 Office 链路保存 Univer JSON，现有 Yjs 把整份 JSON 放在 `office.snapshot` 单值中；这不能宣称支持单元格级并发合并。原来的无条件快照保存也不能用于新资源。
- XLSX 链路由 SheetJS 读写文件版本，并转换为简化的 Univer 快照；图表、透视表、宏、外部连接及复杂格式不能保证无损往返。因此新资源不以 XLSX 作为内部保存格式，不在打开时导入/重建。
- 新资源使用 `typeId=xpert.spreadsheet`、`modelId=office-editor.univer-workbook`、`schemaVersion=1`、`editProtocol=office-editor.snapshot-cas@1`；实现 `office-editor.univer`，编辑器 `office-editor.univer-workbook`。
- 复用 OfficeDocument/OfficeSnapshot，新增显式模型标记。已提交的原生 JSON 快照及 head revision 是唯一可写权威；Project 文件工作区保存不可变 JSON 源快照，作为可下载、可检查的文件投影。文件不另开写入口，不形成双主副本。
- 数据库事务内锁定资源、检查 expectedRevision，先写入按版本和哈希命名的不可变 Project JSON，再追加快照并推进 head；文件写入失败则事务不提交，客户端保留修改。文件已写而进程中断只产生未引用文件，重试复用相同内容，不能推进错误 head。catalog reconciliation 可以从已提交快照恢复缺失文件，发现同路径被修改则报告冲突，不能覆盖外部内容。本期不提供从任意 JSON 覆盖现有资源的导入入口。灾难恢复依赖数据库快照与 Project 文件一同备份。

## 实施顺序

1. 注册内容提供者和资源编辑器：动态分类、分页发现、描述、幂等创建、重命名/复制/回收/恢复、版本绑定的文本提取。权限沿用 Project；不增加 Spaces 类型判断。
2. 为新模型增加严格的版本保存入口和源投影；旧 Yjs、无版本快照和 XLSX 转换入口不能写入新模型。创建/复制重试不得覆盖已有资源。
3. 复用 Univer 引擎初始化，新增本插件内按需工作簿 Remote View；共享 shadcn 外围控件、宿主主题变量、中英文目录。导航复用平台 resolve / 当前 Workbench，内容身份、项目与标签实例保持稳定。
4. 复用 `office_excel_read/edit` 工具处理原生工作簿，必须先读版本，再在同一 JSON 上应用有界操作；返回冲突而非覆盖。不在视图内新增通用 AI 或审阅流程。
5. 单元测试、类型检查、构建、元数据与 lifecycle harness，之后部署隔离环境并执行真实业务验收。

## 协作承诺

本期原生 Spreadsheet 为版本协作，不提供实时光标、离线 CRDT 合并或自动合并冲突。两位成员及人与 Assistant 可以读取和提交同一资源，但并发基于旧 revision 的写入必须失败。视图保留未保存内容，可显式重新加载或下载本地 JSON 以保留修改。宿主上下文、语言和主题更新不应清除未提交内容；浏览器刷新验收以先保存为前提。只读成员使用 Univer 只读权限与服务端写入检查双重控制。

## 验收

- Spaces 发现、创建、当前 ChatKit 内打开；同本重复打开定位既有标签，不同本隔离，刷新恢复。
- 浏览器编辑值、公式、工作表，保存并刷新；Project JSON、Office head、catalog contentId 与资源 ID 对应。
- 创建重试不重复，保存并发冲突不覆盖；成员/只读/非成员边界；双用户及真实 Assistant 工具并发。
- 源文件写入失败不提交 head，恢复文件权限后重试；缺失文件由 catalog reconciliation 恢复；已有 XLSX/Docs/Slides 的定向回归。
- 结果和未覆盖项另记交付文档，不用 mock、直接数据库写入或健康检查代替业务验收。
