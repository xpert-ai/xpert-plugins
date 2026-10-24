# 企业 Assistant 模板系列

以 [Grok Bot Marketplace](https://x.ai/bot/marketplace) 2026-10-14 的全部分类页面为范围，去重收录 **90 个模板**。包含 89 个原创功能适配包和已有 Office Ops；所有包均为文件型 Agent Plugins，不需要新增 NestJS 服务端模块。

[查看头像与分类画廊](gallery.html) · [90 人头像总览](avatar-sheet.html) · [生成与校验说明](../../README.md)

## 收录与适配边界

“全部”指本次可公开访问的市场列表快照，不承诺未来新增条目自动同步。首页和 From Grok Bot Team 是推荐入口，不另建重复包；多类别模板保留源分类并选定一个主类别。四个仅在推荐入口出现的模板补充了编辑分类并单独注明。

每个新包包含原创职责、三个任务技能、初始文件、默认审批和独立头像。上游长篇提示词和技能正文不入库；不复制头像、凭据或私有配置。源作者仅用于归属记录，不代表授权背书。上游技能、自动化、专有工具和真实供应商集成没有逐项等价迁移，详见每包 README 与 docs/provenance.json；业务模型执行另行验收。

分类 JSON 是生成源；全部 90 个包统一放在 `assistants/` 子目录，quickstart 通过显式 path 定位。Office Ops 使用相同目录与来源元数据结构，保留其 7 个技能和 3 个例行任务，生成器不改写已有业务配置。

## 工程研发（9）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 智能体设计师 | [dr eggbot ](https://x.ai/bot/marketplace/bots/dr-eggbot-v2) | [assistant-dr-eggbot-v2](../../assistants/assistant-dr-eggbot-v2/README.md) |
| 工程交付监督员 | [Lingxi's Engineer Bot ](https://x.ai/bot/marketplace/bots/engineer-bot) | [assistant-engineer-bot](../../assistants/assistant-engineer-bot/README.md) |
| 工程负责人助理 | [Engineering Lead ](https://x.ai/bot/marketplace/bots/engineering-lead) | [assistant-engineering-lead](../../assistants/assistant-engineering-lead/README.md) |
| 代码质量巡检员 | [Nightly Audit Engineer ](https://x.ai/bot/marketplace/bots/nightly-audit-engineer) | [assistant-nightly-audit-engineer](../../assistants/assistant-nightly-audit-engineer/README.md) |
| 团队项目协调员 | [Projects Manager ](https://x.ai/bot/marketplace/bots/projects-manager) | [assistant-projects-manager](../../assistants/assistant-projects-manager/README.md) |
| 发布验收测试员 | [QA bot ](https://x.ai/bot/marketplace/bots/qa-bot) | [assistant-qa-bot](../../assistants/assistant-qa-bot/README.md) |
| 事实核查研究员 | [Researchy ](https://x.ai/bot/marketplace/bots/researchy) | [assistant-researchy](../../assistants/assistant-researchy/README.md) |
| 软件开发工程师 | [SWE ](https://x.ai/bot/marketplace/bots/seed-a91e4c) | [assistant-seed-a91e4c](../../assistants/assistant-seed-a91e4c/README.md) |
| API 插件工程师 | [tinkabot ](https://x.ai/bot/marketplace/bots/tinkabot) | [assistant-tinkabot](../../assistants/assistant-tinkabot/README.md) |

## 销售与客户（23）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 客户研究顾问 | [Account Research Desk ](https://x.ai/bot/marketplace/bots/account-book) | [assistant-account-book](../../assistants/assistant-account-book/README.md) |
| 重点客户分析师 | [GTM Account Research ](https://x.ai/bot/marketplace/bots/account-research) | [assistant-account-research](../../assistants/assistant-account-research/README.md) |
| 销售会后跟进助理 | [Call Follow-Ups ](https://x.ai/bot/marketplace/bots/call-follow-ups) | [assistant-call-follow-ups](../../assistants/assistant-call-follow-ups/README.md) |
| 企业知识问答助理 | [Company Docs Q&A ](https://x.ai/bot/marketplace/bots/company-docs-q-a) | [assistant-company-docs-q-a](../../assistants/assistant-company-docs-q-a/README.md) |
| 科技商业情报员 | [Cooper ](https://x.ai/bot/marketplace/bots/cooper) | [assistant-cooper](../../assistants/assistant-cooper/README.md) |
| 客户沟通教练 | [Customer Call Coach & Assistant ](https://x.ai/bot/marketplace/bots/customer-call-coach) | [assistant-customer-call-coach](../../assistants/assistant-customer-call-coach/README.md) |
| 产品支持回复助理 | [Product Support Inbox Assistant ](https://x.ai/bot/marketplace/bots/customer-question-drafter) | [assistant-customer-question-drafter](../../assistants/assistant-customer-question-drafter/README.md) |
| 客户案例编辑 | [Customer Proof Desk ](https://x.ai/bot/marketplace/bots/customer-stories) | [assistant-customer-stories](../../assistants/assistant-customer-stories/README.md) |
| 合作谈判沟通教练 | [Partnerships Call Coach ](https://x.ai/bot/marketplace/bots/dan-lanning) | [assistant-dan-lanning](../../assistants/assistant-dan-lanning/README.md) |
| 商机资格审查员 | [Deal Inspector ](https://x.ai/bot/marketplace/bots/deal-qualification) | [assistant-deal-qualification](../../assistants/assistant-deal-qualification/README.md) |
| 客户价值复盘顾问 | [EBR & Value Deck Builder ](https://x.ai/bot/marketplace/bots/ebr-value-deck-builder) | [assistant-ebr-value-deck-builder](../../assistants/assistant-ebr-value-deck-builder/README.md) |
| 会议演示稿助理 | [Meeting Recap Deck ](https://x.ai/bot/marketplace/bots/echo) | [assistant-echo](../../assistants/assistant-echo/README.md) |
| 承诺跟进协调员 | [GTM Loop Closer ](https://x.ai/bot/marketplace/bots/follow-through-agent) | [assistant-follow-through-agent](../../assistants/assistant-follow-through-agent/README.md) |
| 企业招聘信号分析师 | [Hiring Signals ](https://x.ai/bot/marketplace/bots/hiring-activity-monitor) | [assistant-hiring-activity-monitor](../../assistants/assistant-hiring-activity-monitor/README.md) |
| 客户开拓助理 | [Outbound Prospecting ](https://x.ai/bot/marketplace/bots/pg) | [assistant-pg](../../assistants/assistant-pg/README.md) |
| 销售预测分析师 | [Pipeline Pulse ](https://x.ai/bot/marketplace/bots/pipeline-health-and-forecast) | [assistant-pipeline-health-and-forecast](../../assistants/assistant-pipeline-health-and-forecast/README.md) |
| 融资演示教练 | [Pitch Deck Coach ](https://x.ai/bot/marketplace/bots/pitch-deck-coach) | [assistant-pitch-deck-coach](../../assistants/assistant-pitch-deck-coach/README.md) |
| 潜客研究专员 | [GTM Prospecting ](https://x.ai/bot/marketplace/bots/prospector) | [assistant-prospector](../../assistants/assistant-prospector/README.md) |
| 销售对话教练 | [Sales Call Coach ](https://x.ai/bot/marketplace/bots/sales-call-coach) | [assistant-sales-call-coach](../../assistants/assistant-sales-call-coach/README.md) |
| 客户旅程助理 | [Sell Bot ](https://x.ai/bot/marketplace/bots/sell-bot) | [assistant-sell-bot](../../assistants/assistant-sell-bot/README.md) |
| 外联节奏助理 | [Sequencer ](https://x.ai/bot/marketplace/bots/sequencer) | [assistant-sequencer](../../assistants/assistant-sequencer/README.md) |
| 客户意向信号分析师 | [Signal Prospector ](https://x.ai/bot/marketplace/bots/signal-prospector) | [assistant-signal-prospector](../../assistants/assistant-signal-prospector/README.md) |
| 商务引荐研究员 | [GTM Connections ](https://x.ai/bot/marketplace/bots/warm-intro-finder) | [assistant-warm-intro-finder](../../assistants/assistant-warm-intro-finder/README.md) |

## 市场营销（25）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| AI 搜索可见度分析师 | [AI Search Visibility ](https://x.ai/bot/marketplace/bots/ai-search-visibility) | [assistant-ai-search-visibility](../../assistants/assistant-ai-search-visibility/README.md) |
| 搜索广告优化顾问 | [Apple Search Ads Review ](https://x.ai/bot/marketplace/bots/apple-search-ads-review) | [assistant-apple-search-ads-review](../../assistants/assistant-apple-search-ads-review/README.md) |
| 视频剪辑交付师 | [Video Edit Desk ](https://x.ai/bot/marketplace/bots/best-video-editor) | [assistant-best-video-editor](../../assistants/assistant-best-video-editor/README.md) |
| 精彩片段编辑 | [Clip Bot ](https://x.ai/bot/marketplace/bots/clip-bot) | [assistant-clip-bot](../../assistants/assistant-clip-bot/README.md) |
| 增长运营协调员 | [Distro Bot ](https://x.ai/bot/marketplace/bots/distro-bot) | [assistant-distro-bot](../../assistants/assistant-distro-bot/README.md) |
| 活动执行统筹 | [Event Producer ](https://x.ai/bot/marketplace/bots/event-producer) | [assistant-event-producer](../../assistants/assistant-event-producer/README.md) |
| 广告预算观察员 | [Ad Spend Watch ](https://x.ai/bot/marketplace/bots/fuse) | [assistant-fuse](../../assistants/assistant-fuse/README.md) |
| 自然表达编辑 | [Copy Humanizer ](https://x.ai/bot/marketplace/bots/human-copywriter) | [assistant-human-copywriter](../../assistants/assistant-human-copywriter/README.md) |
| 视觉素材整理师 | [Stills & Clips Desk ](https://x.ai/bot/marketplace/bots/image-gen-bot) | [assistant-image-gen-bot](../../assistants/assistant-image-gen-bot/README.md) |
| 线索管道助理 | [Lead Pipeline Desk ](https://x.ai/bot/marketplace/bots/leadsworth) | [assistant-leadsworth](../../assistants/assistant-leadsworth/README.md) |
| 活动页面助理 | [Luma Pages ](https://x.ai/bot/marketplace/bots/luma-pages) | [assistant-luma-pages](../../assistants/assistant-luma-pages/README.md) |
| 市场竞争研究员 | [Market Researcher ](https://x.ai/bot/marketplace/bots/market-researcher) | [assistant-market-researcher](../../assistants/assistant-market-researcher/README.md) |
| 营销数据分析师 | [Marketing Analyst ](https://x.ai/bot/marketplace/bots/marketing-analyst) | [assistant-marketing-analyst](../../assistants/assistant-marketing-analyst/README.md) |
| 营销项目统筹 | [Project Manager ](https://x.ai/bot/marketplace/bots/marketing-project-manager) | [assistant-marketing-project-manager](../../assistants/assistant-marketing-project-manager/README.md) |
| 品牌提及观察员 | [Overheard ](https://x.ai/bot/marketplace/bots/overheard) | [assistant-overheard](../../assistants/assistant-overheard/README.md) |
| 投放实验执行顾问 | [Performance Marketer ](https://x.ai/bot/marketplace/bots/performance-marketer) | [assistant-performance-marketer](../../assistants/assistant-performance-marketer/README.md) |
| 产品定位顾问 | [Product Marketer ](https://x.ai/bot/marketplace/bots/product-marketer) | [assistant-product-marketer](../../assistants/assistant-product-marketer/README.md) |
| 搜索内容策划师 | [SEO & AEO Desk ](https://x.ai/bot/marketplace/bots/seo-aeo-desk) | [assistant-seo-aeo-desk](../../assistants/assistant-seo-aeo-desk/README.md) |
| 网站质量审查员 | [Site Audit ](https://x.ai/bot/marketplace/bots/site-audit) | [assistant-site-audit](../../assistants/assistant-site-audit/README.md) |
| 付费媒体报告员 | [Paid Media Report Desk ](https://x.ai/bot/marketplace/bots/tally) | [assistant-tally](../../assistants/assistant-tally/README.md) |
| 短视频制作师 | [Video Editor ](https://x.ai/bot/marketplace/bots/video-editor) | [assistant-video-editor](../../assistants/assistant-video-editor/README.md) |
| 网站运营工程师 | [Website Ops ](https://x.ai/bot/marketplace/bots/website-ops) | [assistant-website-ops](../../assistants/assistant-website-ops/README.md) |
| 专业写作伙伴 | [Writing Bot ](https://x.ai/bot/marketplace/bots/writing-bot) | [assistant-writing-bot](../../assistants/assistant-writing-bot/README.md) |
| 贵宾活动计划助理 | [WTD ](https://x.ai/bot/marketplace/bots/wtd) | [assistant-wtd](../../assistants/assistant-wtd/README.md) |
| 社交动态简报员 | [X Brief ](https://x.ai/bot/marketplace/bots/x-brief) | [assistant-x-brief](../../assistants/assistant-x-brief/README.md) |

## 设计创意（4）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 设计评审顾问 | [Critiquito: Design Critique ](https://x.ai/bot/marketplace/bots/critiquito) | [assistant-critiquito](../../assistants/assistant-critiquito/README.md) |
| 设计交付工程师 | [figma bro ](https://x.ai/bot/marketplace/bots/figma-bro) | [assistant-figma-bro](../../assistants/assistant-figma-bro/README.md) |
| 图像无障碍描述员 | [Imogen ](https://x.ai/bot/marketplace/bots/imogen) | [assistant-imogen](../../assistants/assistant-imogen/README.md) |
| 游戏视觉指导 | [Game Art Director ](https://x.ai/bot/marketplace/bots/sable-game-art) | [assistant-sable-game-art](../../assistants/assistant-sable-game-art/README.md) |

## 个人事务（15）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 健康习惯助理 | [Chief Health Officer ](https://x.ai/bot/marketplace/bots/chief-health) | [assistant-chief-health](../../assistants/assistant-chief-health/README.md) |
| 信用卡权益助理 | [Credit Card Max ](https://x.ai/bot/marketplace/bots/credit-card-max) | [assistant-credit-card-max](../../assistants/assistant-credit-card-max/README.md) |
| 采购比价助理 | [Deal Hunting ](https://x.ai/bot/marketplace/bots/deal-hunting) | [assistant-deal-hunting](../../assistants/assistant-deal-hunting/README.md) |
| 电话事务助理 | [dial bot ](https://x.ai/bot/marketplace/bots/dial-bot) | [assistant-dial-bot](../../assistants/assistant-dial-bot/README.md) |
| 植物养护助理 | [Flora: Plant Care Log ](https://x.ai/bot/marketplace/bots/flora) | [assistant-flora](../../assistants/assistant-flora/README.md) |
| 家庭设备助理 | [Home robots ](https://x.ai/bot/marketplace/bots/home-robots) | [assistant-home-robots](../../assistants/assistant-home-robots/README.md) |
| 助手配置迁移顾问 | [Import Bot ](https://x.ai/bot/marketplace/bots/import-bot) | [assistant-import-bot](../../assistants/assistant-import-bot/README.md) |
| 亲密关系事务助理 | [Love ❤️ ](https://x.ai/bot/marketplace/bots/love) | [assistant-love](../../assistants/assistant-love/README.md) |
| 家庭事务协调员 | [NYC Parent ](https://x.ai/bot/marketplace/bots/nyc-parent) | [assistant-nyc-parent](../../assistants/assistant-nyc-parent/README.md) |
| 卡通头像设计师 | [Pfp Bot ](https://x.ai/bot/marketplace/bots/pfp-bot) | [assistant-pfp-bot](../../assistants/assistant-pfp-bot/README.md) |
| 街道清扫查询助理 | [skippy ](https://x.ai/bot/marketplace/bots/skippy) | [assistant-skippy](../../assistants/assistant-skippy/README.md) |
| 技术演示制作员 | [Tech Demos ](https://x.ai/bot/marketplace/bots/tech-demos) | [assistant-tech-demos](../../assistants/assistant-tech-demos/README.md) |
| 私人晨报编辑 | [The Morning Newspaper ](https://x.ai/bot/marketplace/bots/the-morning-newspaper) | [assistant-the-morning-newspaper](../../assistants/assistant-the-morning-newspaper/README.md) |
| 家庭日程助理 | [Tradbot ](https://x.ai/bot/marketplace/bots/tradbot-2) | [assistant-tradbot-2](../../assistants/assistant-tradbot-2/README.md) |
| 个人站点助理 | [Webby ](https://x.ai/bot/marketplace/bots/webby) | [assistant-webby](../../assistants/assistant-webby/README.md) |

## 招聘与人才（2）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 招聘流程协调员 | [Recruiting Coordinator ](https://x.ai/bot/marketplace/bots/mr-toms) | [assistant-mr-toms](../../assistants/assistant-mr-toms/README.md) |
| 人才寻访研究员 | [Talent Discovery ](https://x.ai/bot/marketplace/bots/sherlock) | [assistant-sherlock](../../assistants/assistant-sherlock/README.md) |

## 产品管理（7）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 竞品变化观察员 | [Competitor Watch ](https://x.ai/bot/marketplace/bots/competitor-watching) | [assistant-competitor-watching](../../assistants/assistant-competitor-watching/README.md) |
| 近期议题研究员 | [last30days ](https://x.ai/bot/marketplace/bots/last30days) | [assistant-last30days](../../assistants/assistant-last30days/README.md) |
| 产品需求顾问 | [PM bot ](https://x.ai/bot/marketplace/bots/pm-bot) | [assistant-pm-bot](../../assistants/assistant-pm-bot/README.md) |
| 产品假设研究员 | [Product Idea Stress Test ](https://x.ai/bot/marketplace/bots/product-idea-stress-test) | [assistant-product-idea-stress-test](../../assistants/assistant-product-idea-stress-test/README.md) |
| 产品原型工程师 | [Proto Bot ](https://x.ai/bot/marketplace/bots/proto-bot) | [assistant-proto-bot](../../assistants/assistant-proto-bot/README.md) |
| 竞品体验研究员 | [Stalk Bot ](https://x.ai/bot/marketplace/bots/stalk-bot) | [assistant-stalk-bot](../../assistants/assistant-stalk-bot/README.md) |
| 产品日常巡检员 | [Startup QA Bot ](https://x.ai/bot/marketplace/bots/startup-qa-bot) | [assistant-startup-qa-bot](../../assistants/assistant-startup-qa-bot/README.md) |

## 运营管理（5）

| Assistant | 原模板 / 来源 | 插件目录 |
| --- | --- | --- |
| 智能体组织架构顾问 | [Alfred ](https://x.ai/bot/marketplace/bots/alfred) | [assistant-alfred](../../assistants/assistant-alfred/README.md) |
| 活动邀约评估员 | [Event Request Desk ](https://x.ai/bot/marketplace/bots/event-request-desk) | [assistant-event-request-desk](../../assistants/assistant-event-request-desk/README.md) |
| 行政日程助理 | [Executive Assistant ](https://x.ai/bot/marketplace/bots/frank) | [assistant-frank](../../assistants/assistant-frank/README.md) |
| 软件采购节省顾问 | [Haggle Bot ](https://x.ai/bot/marketplace/bots/haggle-bot) | [assistant-haggle-bot](../../assistants/assistant-haggle-bot/README.md) |
| Office Ops | [Office Ops Desk ](https://x.ai/bot/marketplace/bots/office-ops-desk) | [office-ops](../../assistants/office-ops/README.md) |
