# 拍照受理（Photo Intake）

一个运行在 Xpert 上的业务应用插件：有人拍照上报一个问题，助手从固定的类别表里给出建议，受理人确认或改选后保存。

> 当前是 0.2.0：可以上传照片建单，由助手查看照片并保存一到三个类别建议，识别失败后可以重试。
> 人工确认或改选类别尚未实现，见[已知限制](#已知限制)。

## 识别流程

1. 受理人在工作台选一张照片、写一句描述，新建受理单（状态“未识别”）。照片在浏览器里压缩到最长边 1280 像素后上传，服务端校验类型和文件头。
2. 点“让助手识别”，工作台通过平台命令替用户在对话框里发一句“请识别受理单……”。
3. 助手调用 `photo_intake_analyze_case`：受理单进入“识别中”，照片通过平台的工具图片能力（`ToolImagesRuntimeCapability`）交给模型，同时要求模型必须支持看图。
4. 助手看图后调用 `photo_intake_submit_suggestions`，保存一到三个类别、把握和理由，受理单进入“待确认”。
5. 工具完成后平台通知工作台刷新；识别中时工作台每 4 秒也会自己刷新一次。

每次进入“识别中”都会把版本号加一，提交建议时必须带上这个版本号，所以：

- 重复发起同一次识别，拿到的是同一个版本号，不会重置。
- 失败后重试会得到新版本号，旧那次如果迟到返回，结果会被拒绝，不会产生两组建议。
- 模型调用失败时标记为“识别失败（model_call_failed）”；助手没提交建议就结束时标记为“no_suggestion”；超过 3 分钟仍在识别中的单子也允许重新识别。

## 产品说明

- **目标用户**：物业或行政前台的受理人。
- **原有工作方式**：同事在群里发一张照片加一句话，受理人凭经验判断属于哪类问题，再手工填工单、转给对应工种。
- **痛点**：描述常常不清楚，分类依赖个人经验，同一条信息要录两遍。
- **AI 的作用**：看照片，从固定类别表中建议类别并说明理由；看不出来时明确说“无法判断”，不硬猜。
- **人的作用**：每一条都由受理人确认或改选，助手不替人做决定。

业务流程、页面原型和功能取舍：待补。

## 结构

| 部分 | 位置 |
|---|---|
| 插件入口和市场元数据 | `src/index.ts` |
| 服务端模块 | `src/lib/photo-intake.plugin.ts` |
| 数据表 | `src/lib/intake-case.entity.ts`（`plugin_photo_intake_intake_case`）、`src/lib/intake-photo.entity.ts`（`plugin_photo_intake_intake_photo`） |
| 业务服务和状态流转 | `src/lib/intake.service.ts` |
| 照片校验 | `src/lib/domain/photo.ts` |
| 类别表（自行编写） | `src/lib/domain/categories.ts` |
| 助手中间件和三个工具 | `src/lib/intake.middleware.ts` |
| 工作台视图 | `src/lib/intake-view.provider.ts` |
| 工作台界面 | `src/lib/remote-components/workbench/` |
| 助手模板 | `src/photo-intake-assistant.yaml`、`src/lib/templates.ts` |

## 运行说明

环境：Node 20、pnpm 8.15.8（本工作区声明的版本）。以下命令在 `community/` 目录执行。

```sh
corepack pnpm install --filter "@community/apps-photo-intake..."
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm --filter @community/apps-photo-intake test
```

`test` 会先构建，再运行 `tests/` 下的测试。安装到 Xpert 的步骤和环境变量示例：待补。

## 运行截图与演示

待补。需要覆盖对话界面、工作台视图、画布（助手模板和中间件）、工具调用，以及至少一个异常情况。

## 验证结果

待补。会列出执行过的命令和结果、两个仓库的基线 SHA、实际测试版本，以及尚未验证的部分。

## 复用来源

本仓库许可为 AGPL-3.0，以下内容来自同一仓库：

- 界面使用共享组件库 `@xpert-ai/plugin-shadcn-ui`（`packages/shadcn-ui`）。
- React 适配文件和界面构建方式参照 `community/apps/material-identity-governance`。
- 插件入口、视图提供者和宿主通信协议的写法参照 `community/apps/dockyard`。

## AI 协作说明

待补。

## 已知限制

- 还没有人工确认或改选类别，建议只能查看。
- 每张受理单只有一张照片；照片以 Base64 存在插件自己的表里，没有接入工作区文件。
- 浏览器读不了的格式（例如多数浏览器里的 HEIC）会提示换一张，不做转换。
- 识别依赖模型支持看图；不支持时平台会直接报错，受理单标为识别失败。
- 类别表是按“办公场所报修”草拟的，场景尚未最终确定。
- 本地真实流程测试用的是自己画的示意图，不是现场照片。
