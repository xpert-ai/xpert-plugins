# 外部模板提取与主题生成流水线

本文是直接可执行的方法，不依赖读取旧 Git 提交后自行推测。

## 1. 输入分型

先确定最高保真输入：

| 输入 | 可直接提取 | 不能直接证明 | 首选路线 |
|---|---|---|---|
| React/JSX 工程 | 组件、props、controls、CSS、assets、运行时 | 业务意图 | 薄适配器导入 |
| HTML + JS | section 顺序、DOM、内嵌 CSS、脚本注册表 | React 字段闭包 | 解析注册表或静态 section，再包装 |
| PPTX | slide tree、文本、形状、图片、主题色、母版 | 原交互控件 | 解析 OOXML，重建组件闭包 |
| PDF | 页面视觉、字体近似、图片和构图 | 字段、控件、动画 | 渲染图片证据，再走 archetype 重建 |
| 模板图片 | 视觉与构图 | 所有运行时契约 | 证据规格 + reuse/modify/new |

混合输入时优先源码契约，图片用于审美审计；不要从截图覆盖源码事实。

在盘点后显式选择 `generationMode`。只有截图/PDF且目标是快速得到可用主题时选择 `reuse-first`：少量签名页负责外部视觉，匹配的原型固定复用 theme01-theme12 的完整页面闭包。用户明确要求深度结构还原或有可提取源码契约时选择 `fidelity`。模式只降低自有 JSX 数量，不改变运行时正确性与完整页库验证。

## 2. 目录和入口盘点

运行 `inspect-external-template.mjs`，然后人工确认：

### 文件层

- 入口 HTML、app.jsx、index.js、preview 文件。
- 页面注册表：`slides`、`SLIDES`、`PAGES`、`PAGE_FILES`、`slideSpec`、`registry`。
- 页面组件和共享 primitive。
- CSS、CSS variables、字体声明、主题 provider。
- 图片、SVG、视频、3D 文件和远程 URL。
- 控件、META、defaults、image slot、context。

### 风险层

- 绝对路径、`file://`、用户目录。
- 全局 body/html CSS。
- 预览器、截图器、开发面板、迁移脚本。
- window 监听、observer、timer、RAF 和媒体生命周期。
- 动态 import、远程字体和 CDN。

盘点输出必须保存为 inventory JSON，不能只在对话中描述。

## 3. 识别页面组织模式

按以下顺序匹配，命中后仍检查是否混合模式：

1. **Registry export**：入口导出含 Component/defaultProps/controls 的数组。
2. **Preview array**：预览 app 中存在 `SLIDES`/`PAGES`，元素引用组件。
3. **Component module list**：每个文件导出 component、defaults、controls，入口只列文件。
4. **META array**：组件自己携带 `META.defaults` 和 `META.controls`。
5. **HTML ordered pages**：HTML section/data-page 决定顺序，文件名或属性指向 JSX。
6. **PAGE_FILES**：HTML/JS 中明确列出页面文件。
7. **slideSpec + slot order**：spec 描述字段，HTML 决定 slot 顺序。
8. **Static HTML pages**：部分封面或章节只有 DOM/CSS，与 React 页混合。
9. **PPTX slide tree**：按母版、版式和重复结构聚类为 archetype。

详细适配模板见 `adapter-patterns.md`。

## 4. 安全复制素材和源码

### 保留

- 页面组件、共享 primitive、主题 Context。
- 页面运行所需 CSS、字体和媒体。
- controls/defaults/META/registry。
- 图片上传和媒体槽实现。

### 排除

- `.git`、截图、审计报告、Markdown 说明。
- preview app、dev server、tweaks panel、迁移脚本。
- 未被入口或组件引用的实验文件。
- 绝对路径和临时下载目录。

### 路径重写

- 资源路径统一改为主题目录相对路径。
- 远程资源先确认许可；需离线交付时下载到 `source/assets`。
- CSS `url()`、JS import、视频 poster、字体 src 全部进入依赖图。
- 每个复制资源记录 `sourcePath -> targetPath -> consumers`。

## 5. 提取页面能力闭包

对每页生成 raw page：

```js
{
  id,
  label,
  Component,
  defaultProps,
  controls,
  roles,
  dependencies
}
```

字段来源优先级：

1. 页面注册表显式值。
2. 组件 `META` / static property。
3. 模块导出的 `defaults` / `controls`。
4. 函数组件参数默认值。
5. 最后才允许从 JSX 可见文本推导 copy 字段；不得推导枚举或数组形状。

控件归一化：

- slider -> range
- enum/radio -> select
- boolean -> toggle
- color -> select + palette display
- image uploader -> media slot action

归一化后为每个公开视觉控件补充 `effect`，声明影响范围、语义目标、最低像素变化比例和区域数。不能证明可见效果的控件不进入工作台。

发现数组时同时提取 count control、最小/最大长度、固定长度和嵌套形状。

## 6. 主题专用适配器

适配器只解决输入工程的组织差异，不负责创造视觉。

```text
external source
  -> theme-specific parser
  -> rawPages
  -> normalizeRuntimePages
  -> serializePages
  -> evaluatePropsContract
  -> metadata + runtime bundle
```

适配器必须：

- 保持原页面顺序。
- 包装基础 CSS，并限制到主题根节点。
- 合并 deck controls 与 page controls。
- 合并 defaults，但不覆盖页面显式默认值。
- 处理静态封面与 React 页混排。
- 修复激活态动画和媒体事件。
- 输出确定性页面 key。

## 7. 提取视觉语法

源码和截图共同生成视觉 evidence：

- tokens：background、foreground、accent、secondary、surface、line。
- typography：heading/body/mono/font weight/line height/max width。
- composition：边距、列数、分栏比例、标题位置、跨页 rail/footer。
- surface：圆角、边框、阴影、实体/透明材质。
- chart：palette、grid、axis、rounding、label placement。
- media：比例、裁切、滤镜、边框、caption。
- ornament：可复用签名 primitive。
- forbidden：明确冲突元素。
- paletteMode：adaptive 或 strict。

源码中的颜色出现次数不等于视觉重要性。必须按实际渲染面积和语义角色归类。

## 8. 构造 archetype 和模块映射

每个外部页面先归入结构家族，再建立 archetype。相同结构仅内容不同的页面合并；构图明显不同的页面分开。

为每个 archetype 查询 `baseline-module-catalog.json`：

- 同 family。
- 字段数量足够。
- 控件类型满足需求。
- 媒体容量满足参考结构。
- contentLocked 为 false。
- 数组深度足够承载结构。

评分顺序：结构匹配 > 媒体匹配 > 字段闭包 > 控件 > 来源主题顺序。颜色相似不作为主要模块选择依据。

同时把 `visualEvidence` 编译为 Style DNA。每条 typography、composition、surface、media、motif、signature、color 和 forbidden 描述获得稳定 rule id；模板要求的 primitive 获得稳定 primitive id。后续推导模块只引用这些规则，不另造一套未经证据支持的视觉语言。

## 9. reuse / modify / new

### reuse

适用：区域比例、媒体数量、图表几何和交互已经匹配。只增加 profile、defaults 重写和主题桥接。

### modify

适用：字段/控件/媒体闭包可用，但标题位置、分栏、卡片或图文关系不匹配。复制整个页面闭包，记录 sourcePageKey，修改 JSX/CSS，不拆字段契约。

### new

适用：无候选结构。按照原主题模式编写具体页面组件，不写万能卡片生成器。必须同时提供 defaults、controls、mediaSlots、roles、CSS 和运行时依赖。

`modify` 和 `new` 都是当前新主题的作者模块，不再由旧模块的运行时 wrapper 临时冒充。外部规划结果必须输出 observed 与 inferred 两类 `ownedModuleProposals`。所有提案包含 archetypeId、family、strategy、独立 componentName 与 implementationStatus；observed 还包含 evidenceRefs，inferred 则包含 Style DNA rule、observed anchor、signature primitive 与 derivationReason。

- 可编辑字段、控件、媒体与运行时能力要求。
- `modify` 的原页面 sourceContract；`new` 明确为无来源闭包。

详细注册和组合规则见 `theme-owned-modules.md`。

## 10. 先做 observed 锚点与 inferred 推导模块

`fidelity` 批量生成前至少完成 8 个 observed 主题自有模块，并覆盖：

1. 封面：验证全局构图和标题。
2. 正文：验证常规信息密度与表面。
3. 指标/图表：验证数值、SVG 和 palette。
4. 媒体：验证图片槽、裁切、caption 和上传。

除四类基础页面外，还必须从比较、时间线、关系、表格、观点中选择至少两类复杂结构。每个 observed 模块记录至少 3 条来自参考页的字体、构图、表面或签名符号证据。`reuse-first` 只需实现至少 2 个最能表达外部模板视觉身份的 observed 签名模块，每个记录至少 1 条页面特有证据；其他 archetype 使用固定复用的原页面闭包。

`fidelity` 规划器再根据结构家族缺口自动生成 8-16 个 inferred proposals；`reuse-first` 默认生成 0 个，最多按明确需要生成 4 个。需要 inferred 时优先补 transition、relationship、distribution、ranking、proportion、statement 等外部模板未展示的能力，再为权重较高的 family 生成第二种构图。每个 inferred 模块必须：

- 不填写直接页面 `evidenceRefs`。
- 引用至少 4 条 Style DNA 规则，覆盖字体、构图、表面/媒体、motif/signature。
- 引用至少 2 个 observed 锚点模块和 1 个签名 primitive。
- 明确记录推导理由与内容形状。
- 编写真实 JSX、defaults、controls、mediaSlots 和运行时依赖，不能停在 scaffold。

observed 与 inferred 页面全部通过真实渲染后，才扩展完整页面库。质量版本 3 的 `reuse-first` 至少 2 个 observed、0 个 inferred、2 个自有家族；`fidelity` 至少 8 个 observed、8 个 inferred、9 个自有家族。

签名页必须在最终工作台的 1920×1080 画布中验证。不要使用与组件相同的较小画布做审计，否则固定尺寸错误会被审计环境掩盖。

## 11. 组合完整页面库

### 页数

- 演讲/活动：78-84。
- 通用/产品：82-88。
- 研究/数据/金融：86-94。
- 总范围：76-96。

### 来源

- 2-5 个原主题。
- 第一个为主结构来源。
- 其余补齐图表、研究、媒体、关系或叙事。

### 分配

1. 先保留 4-5 个封面候选。
2. 预留 1-2 个结尾。
3. 按 familyWeights 用最大余数法分配正文数量。
4. 同家族按能力强项、来源顺序和稳定 hash 选页。
5. `moduleOrigin: owned` 的 observed/inferred 页面和 `recipe.pinnedModules` 固定复用页优先占对应家族名额；其余旧模块补齐未覆盖能力。
6. 去重，不循环复制补页数。
7. 每页记录 sourceTheme、sourcePageKey、moduleFamily、moduleOrigin、moduleStrategy、archetypeId 和 evidenceMode；observed 记录 evidenceRefs，inferred 记录 derivedFromRules、anchorModuleRefs 和 stylePrimitiveRefs。

完整主题至少覆盖九个结构家族。场景不需要的家族可以少，但不能用大量 general 页面掩盖能力缺口。

## 12. 视觉桥接

### adaptive

适用于外部模板允许多色图表或深浅变化。保留源模块部分层级，通过语义类和 CSS variables 调色。

### strict

适用于参考模板有稳定基础色。必须清除：

- 内部整页 canvas。
- 源主题渐变和 glow。
- `-webkit-text-fill-color`。
- 普通 div/span 内联色。
- SVG fill/stroke。
- 与参考冲突的阴影和滤镜。

然后按 token 重建画布、正文、强调、surface、line 和 chart。实现依据 profile，不按 theme key 写补丁。

## 13. 元数据与运行时生成

1. 标准化页面。
2. 序列化 defaults 和 controls。
3. 推导 copyKeys、copyBudgets、propShapes、countBindings、numericBounds。
4. 从真实媒体 Context 生成 mediaSlots。
5. 生成 metadata.js 和 layout manifest。
6. 构建 Node runtime 与 browser runtime。
7. 复制所有来源主题 assets。

## 14. 验证矩阵

### 静态能力

- 页数 76-96。
- 至少两个原来源。
- 至少九个家族。
- slot 唯一。
- 字段、数组、控件、count binding 达标。
- 至少五个可写媒体页，至少一页容量 3。

### 真实视觉

- 四类签名页与每个 archetype 均渲染。
- strict 主题通过背景覆盖和反向画布泄漏检查。
- 浏览器首尾页非空。
- 导出 PDF 联系表检查构图、裁切、溢出和默认文案。
- 用两种哨兵背景渲染 1920×1080 最终画布，未覆盖或透明泄漏区域不超过 1%。
- 逐个改变 toggle/select/range/color 控件并做像素差；零变化、变化过小或仅集中在单一微小区域时失败。
- 对完整 76-96 页组合库逐页检查文字越界、容器裁切、超过 220px 的非装饰长文本、异常行高和大字覆盖正文；不能只检查主题自有页。

### 追踪

- evidence spec 可定位参考。
- 每页可定位来源模块和策略。
- modify/new 有审计记录。
- `signature-modules.json` 中所有 implemented 模块都进入运行时，且 family 与运行时一致。
- inferred 模块的 Style DNA rule、observed anchor、signature primitive 与 derivationReason 在清单和运行时中一致，且不得声称直接页面证据。
- scaffold 状态不能通过能力验证。

## 15. 失败时回退顺序

1. 视觉不符：先检查内部源画布和 paletteMode，不先改 token。
2. 构图不符：reuse 改为 modify，不堆 CSS 强行移动。
3. 字段不足：换更丰富模块，不添加无契约临时字段。
4. 媒体不可写：换真实 mediaSlots 页面，不猜 `image` prop。
5. 动画失效：修复激活态生命周期，不删掉动画控件。
6. 页面不足：增加新的真实模块，不复制同页凑数。
7. 画布留黑：检查页面根尺寸和重复缩放；统一改为 1920×1080 父级填充，不通过修改工作台背景掩盖。
8. 控件变化过小：扩大控件对语义目标的作用范围；若控件只控制无关紧要的小装饰，则删除公开控件。
9. 大字覆盖正文：先检查严格配色通配选择器是否把背景/描边字变成实色，再检查默认文案是否超过源字段视觉宽度；禁止只缩小某一页字体掩盖生成规则问题。
