import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import {
  SITES_FEATURE,
  SITES_PLUGIN_NAME,
  SITES_PROVIDER_KEY,
  SITES_TEMPLATE_PROVIDER_KEY,
  SITES_VIEW_KEY
} from './constants.js'

const SITES_TEMPLATE_KEY = 'sites-builder-assistant'
const SITES_TEMPLATE_FILE = 'xpert-sites-assistant.yaml'
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type SiteTemplateI18nText = string | {
  en_US: string
  zh_Hans?: string
}

export type SiteTemplateGalleryItem = {
  key: string
  prompt: {
    en_US: string
    zh_Hans?: string
  }
  builtWith: SiteTemplateI18nText
  model: SiteTemplateI18nText
  techStack: SiteTemplateI18nText
  useCase: SiteTemplateI18nText
  type: SiteTemplateI18nText
}

const staticSiteWorkflowEn = `Use the available sandbox file tools to create files under the specified /workspace/sites/<slug>/ directory.

Create a static site only: a root index.html plus optional styles.css and app.js. Do not create package.json, Vite, React, Next.js, Drizzle, D1 migrations, Cloudflare Worker code, or a full project scaffold.

After the files exist, call the Sites tools in this order: sites_create_project with the same sourcePath, sites_save_version, then sites_deploy_version or sites_create_and_deploy. Deploy with access mode workspace_all unless the user asks otherwise.`

const staticSiteWorkflowZh = `使用可用的沙箱文件工具，在指定的 /workspace/sites/<slug>/ 目录下创建文件。

只创建静态站点：根目录 index.html，以及可选的 styles.css 和 app.js。不要创建 package.json、Vite、React、Next.js、Drizzle、D1 migration、Cloudflare Worker 代码，也不要生成完整项目脚手架。

文件创建完成后，按顺序调用 Sites 工具：使用相同 sourcePath 调用 sites_create_project，然后调用 sites_save_version，最后调用 sites_deploy_version 或 sites_create_and_deploy。除非用户另有要求，发布访问权限使用 workspace_all。`

const prompt = (en_US: string, zh_Hans: string): SiteTemplateGalleryItem['prompt'] => ({ en_US, zh_Hans })
const text = (en_US: string, zh_Hans: string): SiteTemplateI18nText => ({ en_US, zh_Hans })
const commonMeta = {
  builtWith: text('Sites in XpertAI', 'XpertAI Sites'),
  model: 'GPT-5.5',
  techStack: text('Static HTML/CSS/JS', '静态 HTML/CSS/JS'),
  type: text('App', '应用')
} satisfies Pick<SiteTemplateGalleryItem, 'builtWith' | 'model' | 'techStack' | 'type'>

export const siteTemplateGalleryItems: SiteTemplateGalleryItem[] = [
  {
    key: 'onboardingHub',
    ...commonMeta,
    useCase: text('Internal Tools', '内部工具'),
    prompt: prompt(
      `Build a new-hire-facing internal site called "Onboarding Hub".

${staticSiteWorkflowEn}

Use sourcePath /workspace/sites/onboarding-hub.

Important adaptation for this Sites Assistant:
- Do not call or mention @notion, @google-drive, @slack, or any connector that is not available in this assistant.
- Do not build D1, R2, upload APIs, workers, migrations, backend routes, or a full app framework.
- If the user provides real onboarding docs, channel names, links, or source notes in chat, base the content on those sources.
- If no real source material is provided, create realistic seeded example content and make the source links clearly editable internal placeholders such as #source-security-guide. Do not claim that placeholder content was discovered from real company systems.
- Keep all persistence client-side with localStorage.

Use the product name "Onboarding Hub" in the header. Personalize the greeting as "Welcome, <first name>" using a small client-side helper that reads a seeded user profile from localStorage or a window.__XPERT_USER__ object when present. Do not show a week/date chip, role-specific badges, or personalization labels.

Design a calm employee-facing dashboard with clear next steps and low cognitive load. Use a bento-box layout:
- Current progress in the upper-left card. This is the only card with an eyebrow label.
- One unified first-week checklist on the right.
- Suggested meetings beneath progress, stretched so its bottom aligns with the checklist.
- A full-width resource library below those cards.
- A lower row with Your documents, Notes for your manager, and Helpful Slack channels.

Create one unified first-week checklist. Include setup tasks in the same checklist, not a separate card. Every checkbox must contribute to one current-progress total.

Each checklist item should show:
- Completion state
- Due date
- Link to its source document, internal page, slide deck, or thread placeholder

Do not show owners or DRIs in the checklist. Save checkbox changes to localStorage immediately and restore them after reload.

Create a Suggested meetings card with relevant first-week sessions, introductions, manager meetings, buddy meetings, or new-joiner sessions. Do not show individual "+" buttons beside meetings. Include one "Plan my first week" action pinned to the bottom of the card.

Create a full-width Resource library below the progress, meetings, and checklist cards. Group resources into useful categories, using these as a starting point when relevant:
- Company basics
- Benefits
- Security
- Team rituals
- Product knowledge
- Engineering setup

Omit empty categories. Each resource should have a source link and a bookmark control backed by localStorage.

The lower row should include:
- Your documents
- Notes for your manager
- Helpful Slack channels

Populate Helpful Slack channels with seeded generally useful onboarding, announcement, support, employee-question, and culture channels unless the user provided real channel names. Include role-specific channels only when clearly appropriate.

The notes card should stretch to the full height of the row and include a tall textarea. Save notes and manager overrides to localStorage.

Support static upload-state demos for:
- Profile picture: PNG or JPG, up to 5 MB
- Signed employee handbook: PDF, up to 10 MB

Validate file type and size in the browser, store only file metadata and preview state in localStorage, and allow users to replace or remove uploaded files. Do not attempt to store file bytes in R2 in this static template.

Use restrained, readable UI with warm neutral surfaces, deep ink typography, and a few host-friendly accent colors.`,
      `构建一个面向新员工的内部站点，名称为 "Onboarding Hub"。

${staticSiteWorkflowZh}

使用 sourcePath /workspace/sites/onboarding-hub。

适配当前 Sites Assistant 的重要要求：
- 不要调用或提到 @notion、@google-drive、@slack，除非这些连接器明确可用。
- 不要构建 D1、R2、上传 API、Worker、migration、后端路由或完整应用框架。
- 如果用户在对话里提供了真实入职文档、频道名称、链接或来源说明，就基于这些资料生成内容。
- 如果没有真实资料，创建真实感的预置示例内容，并把来源链接写成清晰可替换的内部占位链接，例如 #source-security-guide。不要声称占位内容来自真实公司系统。
- 所有持久化都使用客户端 localStorage。

在页头使用产品名 "Onboarding Hub"。问候语使用 "Welcome, <first name>"，通过一个客户端 helper 从 localStorage 里的 seeded user profile 或存在时的 window.__XPERT_USER__ 对象读取名字。不要显示周次/日期 chip、角色专属 badge 或个性化说明标签。

设计成一个平静、低认知负担、下一步清晰的员工看板。使用 bento-box 布局：
- Current progress 位于左上卡片，并且只有这张卡片带 eyebrow label。
- 右侧是一张统一的 first-week checklist。
- Suggested meetings 位于进度卡下方，并拉伸到与 checklist 底部对齐。
- Resource library 在上述卡片下方全宽展示。
- 底部一行包含 Your documents、Notes for your manager 和 Helpful Slack channels。

创建一个统一的 first-week checklist。把必需的 setup tasks 放进同一个 checklist，不要拆成单独卡片。每个 checkbox 都必须贡献到同一个 Current progress 总进度。

每个 checklist item 应显示：
- 完成状态
- 截止日期
- 指向来源文档、内部页面、slide deck 或 thread 占位链接的链接

不要在 checklist 中展示 owner 或 DRI。checkbox 变更要立即保存到 localStorage，并在刷新后恢复。

创建 Suggested meetings 卡片，包含首周课程、介绍会议、manager meeting、buddy meeting 或 new-joiner session 等合适内容。不要在每个会议旁边显示单独的 "+" 按钮。在卡片底部固定一个 "Plan my first week" 操作。

在 progress、meetings 和 checklist 下方创建一个全宽 Resource library。根据内容分组资源，相关时从这些类别开始：
- Company basics
- Benefits
- Security
- Team rituals
- Product knowledge
- Engineering setup

省略空类别。每个资源都要有来源链接，并提供 localStorage 支持的 bookmark 控件。

底部一行包含：
- Your documents
- Notes for your manager
- Helpful Slack channels

Helpful Slack channels 使用预置的通用入职、公告、支持、员工问答和文化频道，除非用户提供了真实频道名称。只有在明确适合当前用户时才加入角色专属频道。

Notes for your manager 卡片要拉伸到该行完整高度，并包含较高的 textarea。notes 和 manager overrides 都保存到 localStorage。

支持静态上传状态演示：
- Profile picture: PNG 或 JPG，最大 5 MB
- Signed employee handbook: PDF，最大 10 MB

在浏览器中校验文件类型和大小，只把文件 metadata 和预览状态保存到 localStorage，并允许替换或移除文件。这个静态模板不要尝试把文件 bytes 存到 R2。

使用克制、易读的界面：温暖中性色表面、深色文字和少量适合宿主主题的强调色。`
    )
  },
  {
    key: 'enablementHub',
    ...commonMeta,
    useCase: text('Internal Tools', '内部工具'),
    prompt: prompt(
      `Build and deploy an internal Enablement Hub for our company.

${staticSiteWorkflowEn}

Use sourcePath /workspace/sites/enablement-hub.

Important adaptation for this Sites Assistant:
- Do not call or mention @google-drive, @notion, @slack, or any connector that is not available in this assistant.
- Do not build D1, backend APIs, migrations, workers, or a full app framework.
- If the user provides real training decks, documents, recordings, playbooks, announcements, recommended learning links, official academy links, documentation, or developer-site URLs in chat, use those sources.
- If no real source material is provided, create realistic seeded example resources and make their source links clearly editable placeholders such as #source-drive-product-demo. Do not claim placeholder content was discovered from real company systems.
- Store the catalog and bookmark state in static JavaScript/localStorage for this template.

The app should list training resources, demos, playbooks, important links, recordings, and relevant announcement-style updates. Also include useful official academy, documentation, and developer-site resources when the user provides them; otherwise include clearly labeled seeded examples.

Organize resources by:
- Role
- Team
- Product area
- Difficulty
- Format
- Freshness

Build a dynamic resources grid that updates immediately when users search or change filters. On desktop, place the search field and all filters on the same row. Allow controls to wrap cleanly on smaller screens.

Add bookmarks:
- Each resource card should have a selectable bookmark control.
- Save bookmarks per employee in localStorage.
- Add a "My learning" tab in the top navigation.
- Populate "My learning" with the employee's bookmarked resources.
- Bookmarks must persist after reloads in this static version.
- Show a helpful empty state when no resources have been saved.

Use a workspace-authenticated identity demo. In the top navigation, show a compact circular avatar containing only the uppercase first letter of the employee's email alias. For example, jamie.smith@company.com should display J. Read the email from window.__XPERT_USER__, localStorage, or seeded fallback data.

Design the app as a modern, airy internal hub with:
- A clean top navigation with "Discover" and "My learning"
- A bento-box Overview section without an "Overview" title
- Bento cards for a featured learning path, an important announcement, a key update, and newly added resources
- A Resources section below with the search and filter bar, resource count, and responsive content grid
- Clear visual source indicators for Drive, Notion, Slack, official academy content, and developer documentation

Keep the design polished and responsive. Include self-check notes in the generated code comments only where useful, and verify bookmark persistence, avatar letter, search behavior, filters, and mobile layout before saving and deploying.`,
      `构建并发布一个公司内部赋能中心，名称为 "Enablement Hub"。

${staticSiteWorkflowZh}

使用 sourcePath /workspace/sites/enablement-hub。

适配当前 Sites Assistant 的重要要求：
- 不要调用或提到 @google-drive、@notion、@slack，除非这些连接器明确可用。
- 不要构建 D1、后端 API、migration、Worker 或完整应用框架。
- 如果用户在对话里提供了真实培训 deck、文档、录屏、playbook、公告、推荐学习链接、官方 academy、文档站或开发者站点 URL，就使用这些来源。
- 如果没有真实资料，创建真实感的预置示例资源，并把来源链接写成清晰可替换的占位链接，例如 #source-drive-product-demo。不要声称占位内容来自真实公司系统。
- 这个模板中 catalog 和 bookmark 状态都使用静态 JavaScript/localStorage 保存。

应用应列出培训资源、demo、playbook、重要链接、录屏和相关公告式更新。用户提供官方 academy、文档或开发者站点资源时也要纳入；否则使用清晰标记的 seeded 示例。

按以下维度组织资源：
- Role
- Team
- Product area
- Difficulty
- Format
- Freshness

构建动态资源网格：用户搜索或修改筛选时立即更新。桌面端搜索框和所有筛选控件放在同一行；较小屏幕下控件应自然换行且不溢出。

添加 bookmarks：
- 每张资源卡都应有可选中的 bookmark 控件。
- 按员工把 bookmarks 保存到 localStorage。
- 顶部导航增加 "My learning" tab。
- "My learning" 展示该员工收藏的资源。
- 这个静态版本中 bookmarks 刷新后必须保持。
- 没有收藏资源时展示有帮助的空状态。

实现一个 workspace-authenticated identity 演示。顶部导航显示紧凑圆形头像，头像中只包含员工邮箱 alias 的大写首字母。例如 jamie.smith@company.com 显示 J。邮箱从 window.__XPERT_USER__、localStorage 或 seeded fallback 数据读取。

设计成现代、通透的内部 hub，包含：
- 干净的顶部导航，含 "Discover" 和 "My learning"
- bento-box Overview 区域，但不要显示 "Overview" 标题
- Bento 卡片分别用于 featured learning path、important announcement、key update 和 newly added resources
- 下方 Resources 区域，包含搜索与筛选栏、资源数量和响应式内容网格
- 为 Drive、Notion、Slack、official academy content 和 developer documentation 提供清晰的视觉来源标识

保持设计精致且响应式。只在有帮助的地方加入简短代码注释，并在保存和发布前验证 bookmark 持久化、头像首字母、搜索行为、筛选和移动端布局。`
    )
  },
  {
    key: 'pulseDashboard',
    ...commonMeta,
    useCase: text('Analytics', '数据分析'),
    prompt: prompt(
      `Build an internal company Pulse Dashboard called "Company Pulse".

${staticSiteWorkflowEn}

Use sourcePath /workspace/sites/company-pulse.

Important adaptation for this Sites Assistant:
- Do not call or mention @kepler, @slack, @spreadsheets, or any connector that is not available in this assistant.
- Do not build D1, warehouse queries, backend APIs, migrations, workers, or a full app framework.
- If the user provides real metric definitions, saved query links, tables, spreadsheet targets, Slack channels, or discussion notes in chat, use those sources.
- If no real metric source material is provided, create realistic seeded metric snapshots for each timing window and make saved query/table/channel links clearly editable placeholders. Do not claim placeholder metrics were queried from real company systems.
- Store dashboard configuration, selected filters, annotations, and cached metric snapshots in localStorage for this static template.

Main layout:
- Do not add a top navigation bar.
- Start directly with the dashboard title and a short descriptive subtitle.
- Place a compact Filters control and a functional timing-window dropdown near the title.
- Support rolling 4-week, 12-week, 26-week, and 52-week views.
- Changing the timing window must update KPI values, deltas, charts, targets, and table labels.
- Do not add a fake refresh button, dead links, warning banners, Data operations cards, or Recent annotations cards.

KPI cards:
- Show the main KPIs in a prominent card grid.
- Include KPIs such as weekly active users, API request volume, revenue, and core availability unless the user supplies better company metrics.
- Each KPI card must display current value, delta for the selected timing window, freshness, compact trend visualization, and status such as fresh, partial, stale, or permission denied.
- Make every dashboard card clickable, not only the top KPI cards. Clicking a card should open the most relevant metric lineage drawer.
- Use a subtle neutral badge for cached-preview or partial-source states. Avoid prominent yellow warning treatments.

Charts and targets:
- Include a product or business momentum chart that updates with the selected timing window.
- Include a target-attainment card sourced from seeded spreadsheet-style targets or user-provided targets.
- Include a full-width Metric health table.

The Metric health table should show:
- Metric
- Status
- Coverage
- Selected-window change
- Trend

Metric lineage drawer:
- Add a metric lineage drawer for operator debugging.
- It should show selected metric name and description, status, coverage, freshness, source tables, fields, saved queries, and a link to the underlying saved query.
- Include a Discussion or support section only when the user supplied real Slack channels or when seeded placeholder channels are clearly marked as placeholders. Hide the section when there is no useful source.
- Do not include a generic Query states legend in the drawer.

Data and caching behavior for the static version:
- Represent cached metric snapshots for each supported timing window in JavaScript data.
- On load, seed only missing localStorage timing-window caches. Do not overwrite a previously refreshed cached snapshot.
- Show loading, stale, partial-data, and permission-denied states contextually on metrics and inside the lineage drawer, without adding a large warning banner.

Quality bar:
- Keep the primary view calm and executive-focused.
- Operator detail should be available through clickable cards and the lineage drawer instead of cluttering the main dashboard.
- Use inline SVG or simple CSS/SVG for compact trend visualizations. Keep the design modern, airy, restrained, and responsive.`,
      `构建一个公司内部 Pulse Dashboard，名称为 "Company Pulse"。

${staticSiteWorkflowZh}

使用 sourcePath /workspace/sites/company-pulse。

适配当前 Sites Assistant 的重要要求：
- 不要调用或提到 @kepler、@slack、@spreadsheets，除非这些连接器明确可用。
- 不要构建 D1、warehouse query、后端 API、migration、Worker 或完整应用框架。
- 如果用户在对话里提供了真实指标定义、saved query 链接、数据表、spreadsheet target、Slack 频道或讨论摘要，就使用这些来源。
- 如果没有真实指标来源资料，为每个 timing window 创建真实感的预置 metric snapshot，并把 saved query/table/channel 链接写成清晰可替换的占位链接。不要声称占位指标来自真实公司系统查询。
- 这个静态模板中 dashboard configuration、selected filters、annotations 和 cached metric snapshots 都保存到 localStorage。

主布局：
- 不要添加顶部导航栏。
- 直接以 dashboard title 和一段简短描述副标题开始。
- 在标题附近放置紧凑 Filters 控件和可用的 timing-window 下拉框。
- 支持 rolling 4-week、12-week、26-week 和 52-week 视图。
- 切换 timing window 必须更新 KPI 数值、delta、图表、target 和表格标签。
- 不要添加假的刷新按钮、死链接、warning banner、Data operations card 或 Recent annotations card。

KPI 卡片：
- 使用醒目的卡片网格展示主 KPI。
- 除非用户提供了更适合公司的指标，否则包含 weekly active users、API request volume、revenue 和 core availability。
- 每张 KPI 卡都必须展示 current value、所选 timing window 的 delta、freshness、紧凑趋势可视化，以及 fresh、partial、stale 或 permission denied 等状态。
- 每张 dashboard card 都可点击，不只顶部 KPI 卡。点击卡片应打开最相关的 metric lineage drawer。
- cached-preview 或 partial-source 状态使用低调的中性 badge。避免醒目的黄色警告样式。

图表和目标：
- 包含一个会随 timing window 更新的 product 或 business momentum chart。
- 包含一个 target-attainment card，数据来自 seeded spreadsheet-style targets 或用户提供的 targets。
- 包含一个全宽 Metric health table。

Metric health table 应展示：
- Metric
- Status
- Coverage
- Selected-window change
- Trend

Metric lineage drawer：
- 添加一个用于 operator debugging 的 metric lineage drawer。
- 展示选中指标名称和描述、status、coverage、freshness、source tables、fields、saved queries，以及底层 saved query 链接。
- 只有当用户提供真实 Slack 频道，或 seeded placeholder 频道被清楚标记为占位内容时，才展示 Discussion/support 区域。没有有用来源时隐藏该区域。
- 不要在 drawer 中加入通用 Query states legend。

静态版本的数据和缓存行为：
- 在 JavaScript 数据中表示每个 supported timing window 的 cached metric snapshot。
- 页面加载时只 seed 缺失的 localStorage timing-window caches。不要覆盖之前已刷新的 cached snapshot。
- 在指标和 lineage drawer 内上下文式展示 loading、stale、partial-data 和 permission-denied 状态，不要添加大型 warning banner。

质量要求：
- 主视图保持平静、面向高管、重点清晰。
- operator detail 通过可点击卡片和 lineage drawer 提供，不要堆到主看板上。
- 用 inline SVG 或简单 CSS/SVG 实现紧凑趋势可视化。整体设计现代、通透、克制且响应式。`
    )
  },
  {
    key: 'sparkboard',
    ...commonMeta,
    useCase: text('Internal Tools', '内部工具'),
    prompt: prompt(
      `Build an internal employee Idea Intake app called "Sparkboard", similar to a modern idea box. If the user provides a different app name, use that name instead.

${staticSiteWorkflowEn}

Use sourcePath /workspace/sites/sparkboard.

Important adaptation for this Sites Assistant:
- Do not build Cloudflare D1, Drizzle schemas, migrations, Worker routes, a Vinext starter, backend APIs, or a full app framework.
- Do not create .openai/hosting.json, db/schema.ts, migration files, package.json, or TypeScript build artifacts for this static template.
- Use a static single-page app with index.html plus optional styles.css and app.js.
- Represent authenticated workspace identity with a client-side demo helper that reads window.__XPERT_USER__, localStorage, or seeded fallback data.
- Store ideas, votes, comments, status history, leaderboard snapshots, filters, and current user state in localStorage.
- Enforce duplicate vote prevention in localStorage by idea id and user email for this static version. Do not claim server-side enforcement.
- Include realistic seeded example ideas so the initial experience feels complete and can be visually reviewed immediately.

Employees should be able to:
- Submit ideas through a polished modal form.
- Upvote ideas once per authenticated workspace identity demo.
- Open an idea detail panel and add comments.
- View their own submissions in a "My Ideas" view.
- Search, filter, and sort ideas.
- Browse ideas by workflow status.
- View a contributor leaderboard based on votes received by their submitted ideas.

Each idea must include:
- Title
- Problem to solve
- Intended audience
- Expected impact
- Effort estimate: low, medium, or high
- Category
- Supporting links
- Status
- Score
- Author
- Created and updated timestamps

Include board views for:
- New
- Trending
- Under review
- Accepted
- Shipped
- Archived

Build the usable product interface directly. Do not create a marketing landing page.

Use a lively, colorful, modern-but-fun design:
- Warm off-white background
- Deep ink typography
- Saturated coral, cobalt blue, violet, amber, and mint accents
- Rounded but restrained components
- Crisp code-native SVG icons
- Playful editorial SaaS feel
- Accessible contrast
- No gradients, stock imagery, mascots, or excessive card nesting

Desktop layout:
- Compact left sidebar with the app name
- Primary navigation: Discover, My Ideas, Leaderboard
- Status navigation with item counts
- Main header: "Ideas worth building"
- Prominent "Share an idea" button
- Coral featured trending-idea band
- Search, category, status, and sort controls
- Two-column score-sorted idea feed
- Right rail with top contributors, category key, and a small encouragement panel

Each idea card should show:
- Prominent upvote control and score
- Title
- Concise problem statement
- Category
- Effort estimate
- Status
- Author
- Comment count

Mobile layout:
- Keep the navigation readable without horizontal overflow.
- Collapse the right rail.
- Preserve the submission CTA, featured idea, filters, and score-sorted feed.

Before saving and deploying, manually verify the static workflows in the generated app:
- Submit an idea.
- Confirm it appears in My Ideas.
- Upvote an idea.
- Confirm a duplicate vote is rejected for the same user email.
- Add a comment.
- Filter to an individual status board.
- Open the leaderboard.

After validation, save and deploy through Sites hosting with access mode workspace_all unless the user asks for a narrower access mode.`,
      `构建一个员工想法收集应用，名称为 "Sparkboard"。

${staticSiteWorkflowZh}

使用 sourcePath /workspace/sites/sparkboard。

适配当前 Sites Assistant 的重要要求：
- 不要构建 Cloudflare D1、Drizzle schema、migration、Worker route、Vinext starter、后端 API 或完整应用框架。
- 这个静态模板不要创建 .openai/hosting.json、db/schema.ts、migration 文件、package.json 或 TypeScript build 产物。
- 使用静态单页应用：index.html，以及可选的 styles.css 和 app.js。
- 使用客户端 demo helper 表示 authenticated workspace identity，从 window.__XPERT_USER__、localStorage 或 seeded fallback 数据读取用户。
- ideas、votes、comments、status history、leaderboard snapshots、filters 和当前用户状态都保存到 localStorage。
- 这个静态版本通过 idea id + user email 在 localStorage 中防止重复投票。不要声称服务端强制。
- 包含真实感的预置示例 ideas，让初始体验完整并可立即视觉评审。

员工应能够：
- 通过精致的弹窗表单提交想法。
- 通过 authenticated workspace identity demo 每个想法只能投票一次。
- 打开想法详情面板并添加评论。
- 在 "My Ideas" 视图查看自己的提交。
- 搜索、筛选和排序想法。
- 按 workflow status 浏览想法。
- 查看基于提交想法获赞数的贡献者排行榜。

每条 idea 必须包含：
- Title
- Problem to solve
- Intended audience
- Expected impact
- Effort estimate: low、medium 或 high
- Category
- Supporting links
- Status
- Score
- Author
- Created and updated timestamps

包含这些 board views：
- New
- Trending
- Under review
- Accepted
- Shipped
- Archived

直接构建可用的产品界面，不要创建营销落地页。

使用活泼、多彩、现代但有趣的设计：
- Warm off-white background
- Deep ink typography
- Saturated coral、cobalt blue、violet、amber 和 mint accents
- 圆角但克制的组件
- 清晰的 code-native SVG icons
- playful editorial SaaS feel
- Accessible contrast
- 不使用 gradients、stock imagery、mascots 或过度嵌套卡片

桌面布局：
- 紧凑左侧边栏，展示 app name
- 主导航：Discover、My Ideas、Leaderboard
- 带数量的 status navigation
- 主标题："Ideas worth building"
- 显眼的 "Share an idea" 按钮
- Coral featured trending-idea band
- Search、category、status 和 sort controls
- 两列按分数排序的 idea feed
- 右侧栏展示 top contributors、category key 和小型 encouragement panel

每张 idea card 应展示：
- 显眼的 upvote control 和 score
- Title
- 简洁的问题陈述
- Category
- Effort estimate
- Status
- Author
- Comment count

移动端布局：
- 导航保持可读，不要水平溢出。
- 折叠右侧栏。
- 保留 submission CTA、featured idea、filters 和 score-sorted feed。

保存和发布前，在生成的静态应用里手动验证：
- 提交 idea。
- 确认它出现在 My Ideas。
- 给 idea 投票。
- 确认同一 user email 的重复投票会被拒绝。
- 添加评论。
- 筛选到单个 status board。
- 打开 leaderboard。

验证后通过 Sites hosting 保存并发布，除非用户要求更窄访问范围，否则 access mode 使用 workspace_all。`
    )
  },
  {
    key: 'launchCal',
    ...commonMeta,
    useCase: text('Planning', '规划协作'),
    prompt: prompt(
      `Build and deploy an internal workspace app called "Launch Cal".

${staticSiteWorkflowEn}

Use sourcePath /workspace/sites/launch-cal.

Important adaptation for this Sites Assistant:
- Do not call or mention Slack, Google Drive, Notion, Google Calendar, or any connector that is not available in this assistant.
- Do not build D1, backend APIs, refresh jobs, migrations, workers, or a full app framework.
- If the user provides real launch records, source links, docs, owners, calendar dates, or context in chat, use those sources.
- If live source ingestion or real context is not available, create realistic representative launch records that demonstrate the intended workflow. Mark source links as editable placeholders such as #source-calendar-launch-review.
- Store launch records, normalized source references, filters, current month, and checklist completion state in static JavaScript/localStorage for this template.

The primary experience should be a polished monthly calendar view, not a generic dashboard. Group launch items by target date and show each item as a compact colored block. Use distinct accent colors for each product area. Each calendar block should surface the launch type, title, owner initials, status, and dependency-risk indicator.

Add:
- A top navigation bar with the Launch Cal brand, a global search field, and the current user avatar.
- Month navigation with previous, next, and Today controls.
- A filter toolbar for team, status, surface, dependency risk, and source freshness.
- A launch count and a dependency-risk legend.
- A footer noting that records are representative static records ready to refresh from Slack, Drive, Notion, and Google Calendar when those sources are connected.

Keep the page header intentionally minimal:
- Show only the title "Upcoming launches."
- Do not add an eyebrow label above the title.
- Do not add a subtitle below the title.
- Do not show a "D1 cache live" badge, sync timestamp, or overflow dot menu in the top navigation.

Each launch calendar item must open a detailed side-panel modal with:
- Status and dependency-risk badges
- Launch title and summary
- Owner, launch date, and launch type
- Interactive launch checklist with completion progress
- Normalized source links back to Slack, Drive, Notion, and Google Calendar placeholders or user-provided sources
- Relevant docs
- Dependencies
- Go-to-market notes
- Blockers
- Last updated time
- Connected-source count

Design direction:
- Modern internal product-tool aesthetic
- Warm off-white background with subtle borders and restrained shadows
- Functional, information-dense calendar layout
- Colored UI blocks for launch items
- Clean typography and compact spacing
- Avoid unnecessary dashboard cards or decorative chrome
- Make the first viewport feel immediately useful and visually polished

Persist checklist updates in localStorage. Keep the normalized source-reference data model suitable for future refresh jobs. Build, validate, save, and deploy through Sites hosting with access mode workspace_all unless the user asks for a narrower access mode.`,
      `构建并发布一个内部工作区应用，名称为 "Launch Cal"。

${staticSiteWorkflowZh}

使用 sourcePath /workspace/sites/launch-cal。

适配当前 Sites Assistant 的重要要求：
- 不要调用或提到 Slack、Google Drive、Notion、Google Calendar，除非这些连接器明确可用。
- 不要构建 D1、后端 API、refresh job、migration、Worker 或完整应用框架。
- 如果用户在对话里提供了真实发布记录、来源链接、文档、负责人、日历日期或上下文，就使用这些来源。
- 如果没有 live source ingestion 或真实上下文，创建真实感的代表性 launch records，用来演示目标工作流。来源链接使用清晰可编辑的占位链接，例如 #source-calendar-launch-review。
- 这个模板中 launch records、normalized source references、filters、current month 和 checklist completion state 都使用静态 JavaScript/localStorage 保存。

主要体验应是精致的月历视图，而不是通用 dashboard。按 target date 分组 launch items，并把每个 item 显示为紧凑彩色块。每个 product area 使用不同强调色。每个 calendar block 应展示 launch type、title、owner initials、status 和 dependency-risk indicator。

添加：
- 顶部导航栏，包含 Launch Cal 品牌、global search field 和当前用户头像。
- 月份导航，包含 previous、next 和 Today 控件。
- 筛选工具栏，支持 team、status、surface、dependency risk 和 source freshness。
- launch count 和 dependency-risk legend。
- 页脚说明这些记录是代表性静态记录；连接 Slack、Drive、Notion 和 Google Calendar 后可用于刷新。

页面 header 保持刻意极简：
- 只显示标题 "Upcoming launches."
- 不要在标题上方添加 eyebrow label。
- 不要在标题下方添加 subtitle。
- 不要在顶部导航中显示 "D1 cache live" badge、sync timestamp 或 overflow dot menu。

每个 launch calendar item 都必须打开详细侧边面板 modal，包含：
- Status 和 dependency-risk badges
- Launch title 和 summary
- Owner、launch date 和 launch type
- 带完成进度的交互式 launch checklist
- 指向 Slack、Drive、Notion、Google Calendar 占位来源或用户提供来源的 normalized source links
- Relevant docs
- Dependencies
- Go-to-market notes
- Blockers
- Last updated time
- Connected-source count

设计方向：
- 现代内部产品工具审美
- Warm off-white background，搭配细微边框和克制阴影
- 功能性、信息密集的 calendar layout
- 使用彩色 UI blocks 表示 launch items
- 清晰字体和紧凑间距
- 避免不必要的 dashboard cards 或 decorative chrome
- 首屏要立即有用，并且视觉上足够精致

checklist 更新保存到 localStorage。normalized source-reference 数据模型要适合未来 refresh jobs。构建、验证后通过 Sites hosting 保存并发布，除非用户要求更窄访问范围，否则 access mode 使用 workspace_all。`
    )
  },
  {
    key: 'eventPlanningHub',
    ...commonMeta,
    useCase: text('Operations', '运营管理'),
    prompt: prompt(
      `Build and deploy an internal, workspace-authenticated Event Planning Hub for our company. Make it available to everyone in the workspace.

${staticSiteWorkflowEn}

Use sourcePath /workspace/sites/event-planning-hub.

Important adaptation for this Sites Assistant:
- Do not call or mention Google Calendar, Slack, Google Drive, Notion, or any connector that is not available in this assistant.
- Do not build D1, R2, backend APIs, server-side permission enforcement, migrations, workers, or a full app framework.
- If the user provides real planned dates, planning channels, Drive links, Notion policies, approval guidance, playbooks, or event context in chat, use those sources.
- If connected sources or real context are not available, use realistic seeded examples and keep source references configurable with clear placeholder links. Do not expose or invent unrelated/sensitive workspace content.
- Store event records, intake status, approvals, template metadata, tasks, task status, policy checklist progress, resource links, comments, and current user identity in static JavaScript/localStorage for this template.
- Demonstrate owner-only accept/reject behavior in the interface and localStorage state, but do not claim server-side enforcement in this static version.
- Do not implement R2 uploads. Store configurable Drive-style references instead of duplicating files.

Build an event intake workflow available to all workspace users. The intake form should include:
- Event title
- Event type
- Audience
- Assigned owner
- Objective
- Date range
- Location or virtual format
- Budget
- Expected headcount
- Vendors
- Policy needs
- Notes and relevant resource links

Permissions demo:
- Any workspace user can submit an intake request.
- Only the assigned event owner can accept or reject the request in the UI.
- Use the current user email demo from window.__XPERT_USER__, localStorage, or seeded fallback data to decide whether owner actions are enabled.

Create separate views for:
- Overview dashboard
- Active intake requests
- Upcoming events
- Past events
- Templates
- Policies and playbooks

Allow users to duplicate a past event or start from templates such as:
- Meetup
- Customer dinner
- Webinar
- Recruiting event
- Team offsite

Each event detail page should include:
- Event health summary with clear status signals
- Timeline and milestones
- Tasks and owners
- Resource links from Drive, Slack, Notion, and Calendar placeholders or user-provided sources
- Approval status
- Owner comments
- Policy checklist
- Activity updates

Include policy checklist items for:
- General approvals
- Accessibility
- Swag
- Vendor review
- Privacy
- Communications

Design direction:
- Make the interface feel like an operations command center for event owners.
- Use a modern, elevated dashboard style with a dark navigation sidebar, a light content canvas, polished cards, strong information hierarchy, and joyful accent colors.
- Prioritize quick scanning: show pending approvals, policy readiness, upcoming milestones, scheduling conflicts, event health, and recent planning activity prominently.
- Use realistic company-specific seeded examples or user-provided source-derived examples when appropriate.
- Build the actual operations app, not a marketing page.

Before saving and deploying:
- Verify the static app visually in desktop and mobile layouts.
- Test the dashboard, intake flow, owner-only action demo, event detail view, template duplication, policy checklist, comments, and responsive layout.
- Deploy with workspace-wide access using workspace_all unless the user asks for narrower access.`,
      `构建并发布一个内部、workspace-authenticated 的 Event Planning Hub，供公司工作区所有成员使用。

${staticSiteWorkflowZh}

使用 sourcePath /workspace/sites/event-planning-hub。

适配当前 Sites Assistant 的重要要求：
- 不要调用或提到 Google Calendar、Slack、Google Drive、Notion，除非这些连接器明确可用。
- 不要构建 D1、R2、后端 API、服务端权限强制、migration、Worker 或完整应用框架。
- 如果用户在对话里提供了真实计划日期、规划频道、Drive 链接、Notion policy、审批指南、playbook 或活动上下文，就使用这些来源。
- 如果没有 connected sources 或真实上下文，使用真实感 seeded examples，并保留可配置的来源引用和清晰占位链接。不要暴露或编造无关/敏感工作区内容。
- 这个模板中 event records、intake status、approvals、template metadata、tasks、task status、policy checklist progress、resource links、comments 和 current user identity 都使用静态 JavaScript/localStorage 保存。
- 在界面和 localStorage 状态中演示 owner-only accept/reject 行为，但这个静态版本不要声称服务端强制。
- 不实现 R2 上传。使用可配置的 Drive-style references，不复制文件。

构建面向所有 workspace users 的 event intake workflow。Intake form 应包含：
- Event title
- Event type
- Audience
- Assigned owner
- Objective
- Date range
- Location or virtual format
- Budget
- Expected headcount
- Vendors
- Policy needs
- Notes and relevant resource links

权限演示：
- 任意 workspace user 都可以提交 intake request。
- 只有 assigned event owner 可以在 UI 中 accept 或 reject request。
- 当前用户 email demo 从 window.__XPERT_USER__、localStorage 或 seeded fallback 数据读取，并据此启用或禁用 owner actions。

创建独立视图：
- Overview dashboard
- Active intake requests
- Upcoming events
- Past events
- Templates
- Policies and playbooks

允许用户复制 past event，或从这些模板开始：
- Meetup
- Customer dinner
- Webinar
- Recruiting event
- Team offsite

每个 event detail page 应包含：
- Event health summary，带清晰状态信号
- Timeline and milestones
- Tasks and owners
- 指向 Drive、Slack、Notion、Calendar 占位来源或用户提供来源的 resource links
- Approval status
- Owner comments
- Policy checklist
- Activity updates

Policy checklist 包含：
- General approvals
- Accessibility
- Swag
- Vendor review
- Privacy
- Communications

设计方向：
- 界面应像 event owners 的 operations command center。
- 使用现代、高级 dashboard 风格：深色导航侧边栏、浅色内容画布、精致卡片、强信息层级和愉悦强调色。
- 优先快速扫描：突出 pending approvals、policy readiness、upcoming milestones、scheduling conflicts、event health 和 recent planning activity。
- 合适时使用真实感公司专属 seeded examples，或用户提供来源衍生出的示例。
- 构建真正可用的运营应用，不要做营销页面。

保存和发布前：
- 在桌面和移动布局中进行静态应用视觉检查。
- 测试 dashboard、intake flow、owner-only action demo、event detail view、template duplication、policy checklist、comments 和响应式布局。
- 除非用户要求更窄访问范围，否则使用 workspace_all 发布到全工作区。`
    )
  }
]

function getSitesTemplateCandidates() {
  const runtimeDir = __dirname
  return [
    join(runtimeDir, '..', SITES_TEMPLATE_FILE),
    join(runtimeDir, SITES_TEMPLATE_FILE),
    join(process.cwd(), 'apps/sites/src', SITES_TEMPLATE_FILE),
    join(process.cwd(), 'community/apps/sites/src', SITES_TEMPLATE_FILE),
    join(process.cwd(), 'dist/apps/sites', SITES_TEMPLATE_FILE)
  ]
}

function readSitesDsl() {
  const candidates = getSitesTemplateCandidates()
  const templatePath = candidates.find((candidate) => existsSync(candidate))
  if (!templatePath) {
    throw new Error(`Sites xpert DSL template file not found: ${candidates.join(', ')}`)
  }
  return readFileSync(templatePath, 'utf8')
}

export const sitesTemplates: XpertTemplateContribution[] = [
  {
    key: SITES_TEMPLATE_KEY,
    name: 'Sites Builder Assistant',
    title: 'Sites 站点构建助手',
    description: '面向站点创建、候选版本保存、生产发布、访问控制和环境值管理的 data-xpert 助手模板。',
    category: 'Sites',
    type: XpertTypeEnum.Agent,
    targetApps: ['data-xpert'],
    targetAppMeta: {
      'data-xpert': {
        types: ['business-assistant'],
        capabilities: [SITES_FEATURE, SITES_VIEW_KEY],
        requiredPlugins: [SITES_PLUGIN_NAME],
        defaultConfig: {
          assistantKind: 'business-assistant',
          businessDomain: 'sites',
          managedBy: 'data-xpert',
          viewProvider: SITES_PROVIDER_KEY
        }
      }
    },
    dslContent: readSitesDsl(),
    order: 30,
    default: false,
    startPrompts: [
      '请创建一个项目请求看板站点，先保存版本，再发布给管理员查看。',
      '请把这个站点改成需要保存用户进度的版本，并使用 D1 存储形态。',
      '请列出最近发布的 Sites 项目并检查生产 URL。'
    ],
    releaseNotes: '创建 Sites 站点构建助手。',
    xpertName: 'Sites 站点构建助手',
    providerKey: SITES_TEMPLATE_PROVIDER_KEY
  } as XpertTemplateContribution
]
