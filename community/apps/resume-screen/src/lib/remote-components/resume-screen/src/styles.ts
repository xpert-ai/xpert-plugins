/**
 * rs- 设计 token 与组件样式表（蓝图 §5/§8/§9，crm injectStyles 同款通道）
 *
 * 通道：shadcn style.css（app.css 随 iframe 注入）负责组件基础样式；本常量只补
 * 布局/徽标/动画等 rs- 前缀定制，自定义选择器一律以 .rs- 隔离。
 *
 * 主题口径（spec §5.2，本文件立论根）：真实机理不是「宿主行内覆写了这批裸名」——
 * 平台侧 remote-component-html 的行内写入走 TOKEN_MAP，其值是 --xui-color-*，与本处的裸
 * shadcn 语义名不重叠，从未覆写过它们。问题出在另一侧：iframe 内压根没有这批裸名声明，
 * 宿主 createRemoteTheme() 读的正是裸名（--background/--foreground/…），读不到只能回落 OS
 * 的 Canvas/CanvasText，整屏失去配色锚点（P2 对比度塌方的根因）。因此收益来自「本表声明了
 * 裸名」本身；!important 的作用对象是插件自身 app.css 的同名 :root 声明与其 .dark 块
 * （app.css:3295），而非宿主的行内 --xui-color-*，同时防 TOKEN_MAP 日后扩到裸名。
 * 唯一确需 !important 的行内对手是 color-scheme——bootstrap 直接写
 * documentElement.style.colorScheme，非 author !important 压不住。深色块在此语境下是死代码
 * （选择器对不上），不得再写 `.dark`。
 *
 * 层级口径（spec §5.6）：样式里禁止出现裸 z-index 数字，一律取 --rs-layer-*，
 * 其档位与 utils.RS_LAYERS 同名同值（单一真源）；伴生的抽屉遮罩不进那张表，由
 * RS_LAYERS.sheet 派生（见下），使全表数值只有一个出处。
 *
 * 导出为常量而非内联字符串：让 CI 能以静态扫描断言上述两条红线（见 styles.spec.ts），
 * `injectStyles()` 只负责插入 <style>；真机 computed 对比度由 T20 兜底。
 */
// utils.ts 只依赖 ./types，反向 import 不成环；层级数值因此只有 RS_LAYERS 一个出处
import { RS_LAYERS } from './utils'

export const RS_STYLES_CSS = `
    :root {
      /* 浅色钉死：下列 shadcn 语义 token 与 app.css 的 :root 同名。宿主 createRemoteTheme()
         按裸名读取，只有本表把它们声明出来它才取到值；!important 压的是 app.css 的同名 :root
         声明（及其 .dark 块），不是宿主的行内 --xui-color-*。取值即本工作台既有设计色板的
         oklch 等价（#ffffff/#1f2937/#2563eb/#e5e7eb/…），不新造颜色。 */
      color-scheme: light !important;
      --background: oklch(1 0 0) !important;                   /* = #ffffff */
      --foreground: oklch(0.278 0.04 256.8) !important;        /* = #1f2937：--rs-text 同源 */
      --card: oklch(1 0 0) !important;
      --card-foreground: oklch(0.278 0.04 256.8) !important;
      --popover: oklch(1 0 0) !important;
      --popover-foreground: oklch(0.278 0.04 256.8) !important;
      --primary: oklch(0.45 0.2 262) !important;               /* ≈#1d4ed8：白字按压钮对比 ≥7:1 */
      --primary-foreground: oklch(1 0 0) !important;
      --secondary: oklch(0.962 0.008 256) !important;
      --secondary-foreground: oklch(0.278 0.04 256.8) !important;
      --muted: oklch(0.962 0.008 256) !important;
      --muted-foreground: oklch(0.556 0.03 257) !important;    /* ≈#6b7280：白底小字辅助文字 ≥4.5:1 */
      --accent: oklch(0.955 0.02 261) !important;
      --accent-foreground: oklch(0.278 0.04 256.8) !important;
      --destructive: oklch(0.62 0.22 25) !important;           /* ≈#dc2626 */
      --destructive-foreground: oklch(1 0 0) !important;
      --border: oklch(0.922 0.007 260) !important;             /* ≈#e5e7eb */
      --input: oklch(0.922 0.007 260) !important;
      --ring: oklch(0.45 0.2 262) !important;
      /* 浮层层级（数值全部取自 utils.RS_LAYERS，样式侧唯一取值口；新增层级先去那张表加档） */
      --rs-layer-inline: ${RS_LAYERS.inline} !important;       /* 文档流内的装饰件基线 */
      --rs-layer-sticky: ${RS_LAYERS.sticky} !important;                        /* 扫描线等行内装饰：不得盖过浮层 */
      --rs-layer-sheet: ${RS_LAYERS.sheet} !important;                         /* 窄容器抽屉面板 */
      --rs-layer-sheet-overlay: ${RS_LAYERS.sheet - 1} !important;             /* 抽屉遮罩压在 sheet 面板下方，故由 sheet 派生、不独立取数 */
      --rs-layer-dialog: ${RS_LAYERS.dialog} !important;
      --rs-layer-popper: ${RS_LAYERS.popper} !important;
      --rs-layer-toast: ${RS_LAYERS.toast} !important;                         /* notice/告警条：最上层不被任何浮层遮挡 */
      /* ===== 以下为本组件自有 token（值、顺序、注释照原 :root 原样搬入，勿改） ===== */
      /* 结构（= crm --crm20-*） */
      --rs-panel: #ffffff;
      --rs-bg-soft: #fbfbfc;
      --rs-border: #e5e7eb;
      --rs-border-soft: #f0f1f3;
      --rs-hover: #fafafa;
      --rs-active: #f1f5ff;
      /* 文字三级 */
      --rs-text: #1f2937;
      --rs-muted: #6b7280;
      --rs-soft: #9ca3af;
      /* 主色：读宿主 token，回退 crm 系蓝 */
      --rs-primary: var(--primary, var(--xui-color-primary, #2563eb));
      --rs-primary-soft: #eff3ff;
      /* 状态色软/强成对（语义映射蓝图 §8） */
      --rs-blue: var(--info, #2563eb);        --rs-blue-soft: #eff6ff;
      --rs-green: var(--success, #047857);    --rs-green-soft: #e8f7ee;
      --rs-amber: var(--warning, #b45309);    --rs-amber-soft: #fff6df;
      --rs-red: var(--destructive, #dc2626);  --rs-red-soft: #fff0ee;
      --rs-neutral: #536174;                  --rs-neutral-soft: #edf2f7;
      /* 规格（= crm/sm 实测公共值） */
      --rs-radius: 5px;
      --rs-radius-lg: 8px;
      --rs-pill: 11px;
      --rs-pill-round: 999px;
      --rs-control-h: 1.875rem;
      --rs-font-control: 0.8125rem;
      /* 动画三档 + 缓动（蓝图 §7） */
      --rs-motion-fast: 120ms;
      --rs-motion-base: 160ms;
      --rs-motion-slow: 240ms;
      --rs-ease-entry: cubic-bezier(0.2, 0, 0, 1);
      --rs-ease-exit: cubic-bezier(0.4, 0, 1, 1);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--rs-panel); color: var(--rs-text); }
    body, button, input, select, textarea { font-family: Inter, "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 0; }
    [data-slot="button"], [data-slot="input"], [data-slot="select-trigger"], [data-slot="textarea"] { font-size: var(--rs-font-control); }
    /* 焦点环保留（蓝图 §6.8，对齐 crm 搜索框 focus 圈）；「琢」补齐自绘可交互件：把手/展开钮与输入族同环 */
    [data-slot="input"]:focus-visible, [data-slot="textarea"]:focus-visible, [data-slot="select-trigger"]:focus-visible, .rs-pill:focus-visible, .rs-item:focus-visible, [data-slot="button"]:focus-visible, .rs-intake-handle:focus-visible, .rs-expand:focus-visible, .rs-notice button:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); }
    /* 列表容器是键盘导航宿主（↑/↓/Enter），焦点可见性用内描边免被 shell overflow 裁切 */
    .rs-list:focus-visible { outline: 2px solid color-mix(in srgb, var(--rs-primary) 45%, transparent); outline-offset: -2px; }
    /* 按钮按压触感：1px 下沉模拟物理按键（仅 transform，reduced-motion 下瞬时生效不伤性能） */
    [data-slot="button"]:active:not(:disabled) { transform: translateY(1px); }
    i[class^="ri-"] { font-style: normal; line-height: 1; display: inline-flex; align-items: center; justify-content: center; }

    /* ===== 骨架布局（蓝图 §3.1：48/40/1fr/auto 四行；中缝 1px） ===== */
    .rs-shell { min-height: 640px; display: grid; grid-template-rows: 48px 40px minmax(0, 1fr) auto; background: var(--rs-panel); position: relative; overflow: hidden; container-type: inline-size; }
    .rs-shell.rs-shell-loading { display: flex; align-items: center; justify-content: center; }
    .rs-boot-loading { color: var(--rs-muted); font-size: 13px; }
    .rs-header { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--rs-border); min-width: 0; }
    .rs-statsbar { display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid var(--rs-border); overflow-x: auto; scrollbar-width: none; }
    .rs-statsbar::-webkit-scrollbar { display: none; }
    .rs-content { min-height: 0; display: grid; grid-template-columns: 320px minmax(0, 1fr); }
    .rs-list-panel { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; border-right: 1px solid var(--rs-border); }
    /* 详情面板容器（宽栏）：内部 rs-detail-stack 自带三行栅格，Sheet 复用同结构 */
    .rs-detail-panel { min-width: 0; min-height: 0; overflow: hidden; }
    .rs-detail-stack { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; min-height: 0; height: 100%; }
    /* 首载失败错误卡（§6.1：crm notice 红变体 + 重试，居中） */
    .rs-error-card { grid-column: 1 / -1; margin: 10px; min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border: 1px solid color-mix(in srgb, var(--rs-red) 40%, transparent); background: var(--rs-red-soft); color: var(--rs-red); border-radius: var(--rs-radius-lg); font-size: 13px; padding: 22px 14px; text-align: center; }
    .rs-error-card i { font-size: 34px; }
    /* 窄容器（<720px JS 属性降级，蓝图 §4）：右详情隐藏，走 Sheet 抽屉 */
    .rs-shell[data-rs-width="narrow"] .rs-content { grid-template-columns: minmax(0, 1fr); }
    .rs-shell[data-rs-width="narrow"] .rs-detail-panel { display: none; }

    /* ===== 岗位切换区（蓝图 §3.2） ===== */
    .rs-job-icon { color: var(--rs-muted); width: 30px; height: 30px; font-size: 16px; flex: 0 0 auto; }
    .rs-job-select [data-slot="select-trigger"] { height: var(--rs-control-h); border-radius: var(--rs-radius); border-color: var(--rs-border); background: var(--rs-panel); font-weight: 650; max-width: 260px; }
    .rs-header-spacer { flex: 1 1 auto; }
    .rs-header-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .rs-header-actions [data-slot="button"] i { margin-right: 6px; font-size: 14px; }
    .rs-header-actions [data-slot="button"][data-size="icon"] i { margin-right: 0; }
    .rs-jd-popover [data-slot="popover-content"] { max-width: 420px; }
    .rs-jd-text { max-height: 240px; overflow: auto; font-size: 12px; line-height: 1.6; color: var(--rs-muted); white-space: pre-wrap; overflow-wrap: anywhere; scrollbar-width: thin; scrollbar-color: var(--rs-border) transparent; }

    /* ===== 统计条 pill（蓝图 §3.3，sm .sm-stat-pill 规格） ===== */
    .rs-pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; border: 1px solid var(--rs-border); border-radius: var(--rs-pill-round); background: var(--rs-panel); color: var(--rs-muted); padding: 0 9px; font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: color var(--rs-motion-base) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry), border-color var(--rs-motion-base) var(--rs-ease-entry); flex: 0 0 auto; }
    .rs-pill strong { font-weight: 750; font-variant-numeric: tabular-nums; color: var(--rs-text); transition: color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-pill.is-zero strong { color: var(--rs-soft); }
    .rs-pill.is-selected { background: var(--pill-strong, var(--rs-blue)); border-color: var(--pill-strong, var(--rs-blue)); color: #fff; }
    .rs-pill.is-selected strong { color: #fff; }
    .rs-pill .rs-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pill-strong, var(--rs-blue)); }
    .rs-pill-total { cursor: default; }
    .rs-timeout-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--rs-amber); }

    /* ===== 左列表（蓝图 §3.4） ===== */
    .rs-list-tools { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 8px; padding: 7px 10px; border-bottom: 1px solid var(--rs-border-soft); min-height: 44px; align-items: center; }
    .rs-search { height: 30px; min-width: 0; display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; gap: 6px; border: 1px solid var(--rs-border); background: var(--rs-bg-soft); border-radius: var(--rs-radius); padding: 0 8px; color: var(--rs-soft); }
    .rs-search:focus-within { border-color: #a9bdf7; box-shadow: 0 0 0 3px rgba(65, 105, 225, 0.12); }
    .rs-search [data-slot="input"] { height: 28px; border: 0; padding: 0; background: transparent; box-shadow: none; }
    .rs-list-filter { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .rs-list-filter [data-slot="select-trigger"] { height: 28px; border-radius: var(--rs-radius); font-size: 12px; }
    .rs-toolbar-button { color: #5f6368; gap: 6px; height: 28px; font-size: 12px; }
    .rs-toolbar-button.is-active { color: var(--rs-text); background: var(--rs-primary-soft); border-color: #ccd8ff; }
    .rs-toolbar-button i { font-size: 14px; }
    .rs-status-select { width: 96px; min-width: 0; }
    .rs-search-chip { grid-column: 1 / -1; display: flex; gap: 6px; align-items: center; }
    .rs-list { min-height: 0; overflow: auto; position: relative; outline: none; }
    .rs-list-skeleton { padding: 10px; display: grid; gap: 10px; }
    /* 首屏骨架行（§3.4：头像块 + 双行条 + 分数位），尺寸对齐真实行防 CLS */
    .rs-sk-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 46px; gap: 8px; align-items: center; min-height: 52px; }
    .rs-sk-lines { display: grid; gap: 6px; min-width: 0; }
    .rs-sk-avatar { width: 28px; height: 28px; border-radius: var(--rs-radius); }
    .rs-sk-avatar-lg { width: 36px; height: 36px; border-radius: var(--rs-radius-lg); }
    .rs-sk-line { height: 14px; border-radius: var(--rs-radius); }
    .rs-sk-half { width: 50%; }
    .rs-sk-third { width: 33%; }
    .rs-sk-two-thirds { width: 66%; }
    .rs-sk-score { width: 64px; height: 24px; border-radius: var(--rs-radius); }
    .rs-sk-bar { flex: 1 1 auto; height: 6px; border-radius: 3px; }
    .rs-sk-pill { width: 96px; height: 22px; border-radius: var(--rs-pill); }
    .rs-sk-pill-sm { width: 80px; }
    .rs-sk-stack { display: grid; gap: 8px; }
    .rs-sk-score-row { display: flex; align-items: center; gap: 8px; }
    .rs-sk-pill-row { display: flex; gap: 6px; }
    .rs-item { display: grid; grid-template-columns: 28px minmax(0, 1fr) 46px; align-items: center; gap: 8px; min-height: 52px; padding: 0 10px; border-bottom: 1px solid var(--rs-border-soft); cursor: pointer; background: var(--rs-panel); transition: background-color var(--rs-motion-fast) var(--rs-ease-entry); }
    .rs-item:hover { background: var(--rs-hover); }
    /* 点按瞬间即呈现选中底色预览（先于数据回流），行点击「跟手」；A8 退场行不可交互 */
    .rs-item:active { background: var(--rs-active); }
    .rs-item[aria-current="true"] { background: var(--rs-active); }
    /* 列表滚动条质感（§9 色板内取值）：细轨透明底，thumb 用边框灰，hover 升一级——与 crm 浅灰语言一致 */
    .rs-list { scrollbar-width: thin; scrollbar-color: var(--rs-border) transparent; }
    .rs-list::-webkit-scrollbar { width: 8px; }
    .rs-list::-webkit-scrollbar-track { background: transparent; }
    .rs-list::-webkit-scrollbar-thumb { background: var(--rs-border); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
    .rs-list::-webkit-scrollbar-thumb:hover { background-color: var(--rs-soft); background-clip: content-box; }
    .rs-item-main { min-width: 0; display: grid; gap: 2px; }
    .rs-item-title { min-width: 0; display: flex; align-items: center; gap: 6px; }
    /* 「琢」长文本不挤压：收缩压力全部让给姓名（自带 ellipsis），来源角标与状态徽标永不压缩变形 */
    .rs-item-title .rs-badge, .rs-item-title i { flex: 0 0 auto; }
    .rs-item-name { font-size: 13px; font-weight: 650; color: var(--rs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-item-source { color: var(--rs-soft); font-size: 11px; flex: 0 0 auto; }
    .rs-item-meta { font-size: 12px; color: var(--rs-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-mark { width: 28px; height: 28px; border-radius: var(--rs-radius); color: #fff; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; background: var(--rs-soft); flex: 0 0 auto; }
    .rs-item-score { display: grid; gap: 3px; justify-items: end; width: 46px; }
    /* 匹配分呈现（P2 裁决）：Badge 数字 + Progress 细条；tabular-nums 防刷新跳动 */
    .rs-score-badge { height: 20px; min-width: 40px; justify-content: center; border-radius: var(--rs-radius); background: transparent; color: var(--rs-text); font-size: 13px; font-weight: 750; font-variant-numeric: tabular-nums; padding: 0 2px; }
    /* Progress 覆写：指示条颜色随分档（根组件用 translateX 表现进度，无需改宽度动画） */
    .rs-score-bar { width: 40px; height: 3px; border-radius: 2px; background: var(--rs-border-soft); }
    .rs-score-bar [data-slot="progress-indicator"] { background: var(--rs-blue); border-radius: 2px; }
    .rs-score-bar.tier-amber [data-slot="progress-indicator"] { background: var(--rs-amber); }
    .rs-score-bar.tier-red [data-slot="progress-indicator"] { background: var(--rs-red); }
    /* Progress 过渡并档（§7 统一时长/缓动）：覆盖 shadcn 默认 transition-all 150ms——
       AI 回填评分时细条 240ms ease-out 生长、分档换色 160ms，只动 transform/background */
    .rs-score-bar [data-slot="progress-indicator"], .rs-score-detail [data-slot="progress-indicator"] { transition: transform var(--rs-motion-slow) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-list-foot { min-height: 40px; border-top: 1px solid var(--rs-border); display: flex; align-items: center; gap: 10px; padding: 0 10px; color: var(--rs-soft); font-size: 12px; }
    .rs-list-foot [data-slot="button"] { height: 28px; }

    /* 空态（蓝图 §3.4：crm 居中竖排 + sm 软底块） */
    .rs-empty { min-height: 280px; margin: 10px; border-radius: 7px; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--rs-muted); padding: 22px 14px; text-align: center; font-size: 13px; /* 空态缓入：筛选切换后不「啪」地砸出，与 A6 详情入场同档 */ animation: rs-detail-in var(--rs-motion-slow) var(--rs-ease-entry); }
    .rs-empty i.rs-empty-icon { width: 42px; height: 42px; border-radius: var(--rs-radius); background: var(--rs-border); color: #4b5563; font-size: 22px; }
    .rs-empty strong { font-weight: 700; color: var(--rs-text); }
    .rs-empty small { color: var(--rs-soft); font-weight: 600; }

    /* ===== 徽标六态（蓝图 §8：高 22、圆角 5、字 12/650、软底强字 + 状态图标/圆点） ===== */
    .rs-badge { display: inline-flex; align-items: center; gap: 5px; height: 22px; border-radius: var(--rs-radius); padding: 0 8px; font-size: 12px; font-weight: 650; border: 1px solid transparent; background: var(--rs-neutral-soft); color: var(--rs-neutral); white-space: nowrap; transition: color var(--rs-motion-base) var(--rs-ease-entry), background-color var(--rs-motion-base) var(--rs-ease-entry), border-color var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-badge i { font-size: 12px; }
    .rs-badge.tone-blue { background: var(--rs-blue-soft); color: var(--rs-blue); }
    .rs-badge.tone-green { background: var(--rs-green-soft); color: var(--rs-green); }
    .rs-badge.tone-amber { background: var(--rs-amber-soft); color: var(--rs-amber); }
    .rs-badge.tone-red { background: var(--rs-red-soft); color: var(--rs-red); }
    /* 失败：浅红底 + 40% 红描边，与「淘汰」软底平色在色弱下区分（蓝图 §8 辅助规则） */
    .rs-badge.tone-failed { background: #fff5f5; color: #b91c1c; border-color: color-mix(in srgb, var(--rs-red) 40%, transparent); }
    /* 排队中/跳过(重复)共用中性对（§8 v2 注：对齐 sm .sm-badge 默认态，不新增颜色） */
    .rs-badge.tone-neutral { background: var(--rs-neutral-soft); color: var(--rs-neutral); }
    .rs-badge-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .rs-badge-edit { background: var(--rs-blue-soft); color: var(--rs-blue); cursor: default; }

    /* ===== 右详情（蓝图 §3.5） ===== */
    .rs-detail-head { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--rs-border); min-height: 76px; align-items: start; }
    .rs-detail-avatar { width: 36px; height: 36px; border-radius: var(--rs-radius-lg); color: #fff; font-weight: 800; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--rs-soft); }
    .rs-detail-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .rs-detail-title strong { font-size: 16px; font-weight: 650; color: var(--rs-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .rs-detail-meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--rs-muted); font-size: 12px; margin-top: 4px; }
    .rs-detail-meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .rs-detail-meta i { font-size: 12px; margin-right: 3px; color: var(--rs-soft); }
    .rs-detail-body { min-height: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr); }
    .rs-detail-scroll { height: 100%; }
    .rs-detail-pad { padding: 2px 14px 12px; }
    /* 首屏详情整块骨架（§6.1）：头像 + 多条灰条 */
    .rs-detail-skeleton { padding: 14px; display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 12px; align-items: start; }
    .rs-sk-blocks { display: grid; gap: 10px; min-width: 0; }
    .rs-section { padding: 12px 0; border-bottom: 1px solid var(--rs-border-soft); }
    .rs-section:last-child { border-bottom: 0; }
    .rs-section-title { color: var(--rs-soft); font-size: 12px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 8px; }
    .rs-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 14px; }
    .rs-field { display: grid; gap: 4px; min-width: 0; }
    .rs-field > span { color: var(--rs-muted); font-size: 12px; font-weight: 650; }
    .rs-field strong { min-width: 0; color: var(--rs-text); font-size: 13px; font-weight: 650; overflow-wrap: anywhere; }
    .rs-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 22px; max-width: 100%; border: 1px solid var(--rs-border); border-radius: var(--rs-pill); background: #f3f4f6; color: #4b5563; padding: 0 9px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .rs-chip-edit button { border: 0; background: transparent; color: var(--rs-soft); cursor: pointer; padding: 0; font-size: 12px; }
    .rs-chip-edit button:hover { color: var(--rs-red); }
    .rs-score-big { display: flex; align-items: baseline; gap: 6px; }
    .rs-score-big strong { font-size: 24px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .rs-score-big span { color: var(--rs-soft); font-size: 12px; }
    .rs-score-detail { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--rs-border-soft); }
    .rs-score-detail [data-slot="progress-indicator"] { background: var(--rs-blue); border-radius: 3px; }
    .rs-score-detail.tier-amber [data-slot="progress-indicator"] { background: var(--rs-amber); }
    .rs-score-detail.tier-red [data-slot="progress-indicator"] { background: var(--rs-red); }
    .rs-reason { font-size: 13px; line-height: 1.6; color: var(--rs-text); overflow-wrap: anywhere; white-space: pre-wrap; }
    .rs-reason.is-collapsed { display: -webkit-box; -webkit-line-clamp: 8; -webkit-box-orient: vertical; overflow: hidden; }
    .rs-expand { color: var(--rs-blue); cursor: pointer; border: 0; background: transparent; font-size: 12px; font-weight: 650; padding: 4px 0 0; }
    .rs-hit { display: flex; flex-wrap: wrap; gap: 6px; }
    .rs-hit span { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; border-radius: var(--rs-pill); padding: 2px 9px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* 命中点绿对 / 风险点红对（软底强字，§3.5 区块三/四） */
    .rs-hit .hit-good { background: var(--rs-green-soft); color: var(--rs-green); }
    .rs-hit .hit-risk { background: var(--rs-red-soft); color: var(--rs-red); }
    .rs-detail-empty { min-height: 280px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--rs-soft); font-size: 13px; }

    /* 编辑态表单 */
    .rs-form { display: grid; gap: 10px; }
    .rs-form-field { display: grid; gap: 5px; }
    .rs-form-field > span { color: var(--rs-muted); font-size: 12px; font-weight: 650; }
    .rs-form-field em { margin-left: 6px; color: #dc2626; font-style: normal; font-weight: 600; }
    .rs-form-field small { margin-left: 8px; color: var(--rs-soft); font-size: 11px; font-weight: 600; }
    .rs-form-field [data-slot="textarea"] { min-height: 88px; resize: vertical; }
    .rs-form-error { color: var(--rs-red); font-size: 12px; }

    /* ===== 处置动作条（蓝图 §3.6） ===== */
    .rs-detail-foot { min-height: 56px; border-top: 1px solid var(--rs-border); display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 14px; background: var(--rs-panel); }
    .rs-detail-foot [data-slot="button"] i { margin-right: 6px; font-size: 14px; }

    /* ===== 底部录入区（蓝图 §3.7） ===== */
    .rs-intake { border-top: 1px solid var(--rs-border); background: var(--rs-panel); }
    /* v4.1 §3.7 把手行：「上传简历文件」主按钮 + 队列展开触发器同级排布，收起态整行高 44px */
    .rs-intake-row { min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 12px; }
    .rs-intake-row [data-slot="button"] i { margin-right: 6px; font-size: 14px; }
    .rs-intake-handle { flex: 1 1 auto; min-width: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; color: var(--rs-muted); font-size: 13px; font-weight: 650; cursor: pointer; text-align: left; }
    .rs-intake-handle i.rs-handle-icon { font-size: 16px; color: var(--rs-soft); }
    .rs-intake-handle .rs-chevron { margin-left: auto; transition: transform var(--rs-motion-base) var(--rs-ease-entry); }
    .rs-intake-handle[aria-expanded="true"] .rs-chevron { transform: rotate(180deg); }
    .rs-intake-hint { color: var(--rs-soft); font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    /* 把手计数徽标（进行中/失败）：失败位红强调（§3.7）。
     字号 11px 为一次性抬值（原 10px 违反全站字号下限红线）；本选择器整块将在 T14 随把手一并删除，
     届时无需回收——扫描规则「全站 <11px 一律红」保持全量严格，不为它开例外。 */
    .rs-handle-badge { height: 18px; border-radius: var(--rs-radius); font-size: 11px; padding: 0 6px; background: var(--rs-blue-soft); color: var(--rs-blue); font-weight: 650; }
    .rs-handle-badge-fail { background: var(--rs-red-soft); color: var(--rs-red); }
    .rs-intake-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 200ms var(--rs-ease-exit); }
    .rs-intake-collapse.is-open { grid-template-rows: 1fr; transition: grid-template-rows 200ms var(--rs-ease-entry); }
    .rs-intake-collapse > div { min-height: 0; overflow: hidden; }
    .rs-intake-body { padding: 0 12px 10px; display: grid; gap: 8px; }
    .rs-queue-summary { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--rs-muted); flex-wrap: wrap; }
    .rs-queue-summary b { font-weight: 750; font-variant-numeric: tabular-nums; color: var(--rs-text); }
    .rs-queue-summary .is-fail { color: var(--rs-red); }
    .rs-queue-clear { margin-left: auto; }
    .rs-queue-scroll { flex: 0 0 auto; }
    .rs-queue-list { display: grid; gap: 2px; padding-right: 6px; }
    .rs-queue-row { min-height: 32px; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto auto; align-items: center; gap: 8px; font-size: 12px; color: var(--rs-text); padding: 0 2px; border-radius: var(--rs-radius); }
    .rs-queue-row:hover { background: var(--rs-hover); }
    .rs-queue-row > i { color: var(--rs-soft); font-size: 14px; }
    .rs-queue-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rs-queue-actions { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .rs-queue-hint { color: var(--rs-soft); font-size: 11px; }
    .rs-queue-span { grid-column: 3 / -1; }
    /* 失败行指引：红软底 notice（§6.6 可执行重新上传指引，role=alert） */
    .rs-queue-fail { grid-column: 1 / -1; margin: 2px 0 6px; display: flex; align-items: flex-start; gap: 6px; border: 1px solid color-mix(in srgb, var(--rs-red) 40%, transparent); background: var(--rs-red-soft); color: var(--rs-red); border-radius: var(--rs-radius); padding: 6px 8px; font-size: 12px; line-height: 1.5; }
    .rs-queue-guidance { font-size: 12px; color: var(--rs-muted); line-height: 1.6; }

    /* ===== notice 条（蓝图 §6.1 通用错误出口；crm .crm20-notice 同构红/琥珀变体） ===== */
    .rs-notice { position: absolute; left: 12px; right: 12px; top: 92px; z-index: var(--rs-layer-toast); display: flex; align-items: flex-start; gap: 8px; border: 1px solid var(--rs-red); background: var(--rs-red-soft); color: var(--rs-red); padding: 8px 10px; border-radius: var(--rs-radius); font-size: 13px; box-shadow: 0 6px 20px rgba(31, 41, 55, 0.08); animation: rs-notice-in var(--rs-motion-slow) var(--rs-ease-entry); }
    @keyframes rs-notice-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
    .rs-notice.tone-amber { border-color: #f2c94c; background: #fffbeb; color: #7a4d00; }
    .rs-notice button { margin-left: auto; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 14px; padding: 0 2px; }
    .rs-notice-inline { position: static; margin: 8px 12px 0; }

    /* ===== 动画清单（蓝图 §7） ===== */
    /* A1 增量刷新扫描线（首屏不用，用 Skeleton）：行内装饰，取 sticky 档，不得盖过任何浮层 */
    .rs-scanline { position: absolute; top: 0; left: 0; height: 2px; width: 35%; background: var(--rs-primary); z-index: var(--rs-layer-sticky); animation: rs-scan 1s ease-in-out infinite; }
    @keyframes rs-scan { 0% { transform: translateX(-100%); } 50% { transform: translateX(160%); } 100% { transform: translateX(360%); } }
    /* A6 详情内容切换 */
    .rs-detail-anim { animation: rs-detail-in var(--rs-motion-base) var(--rs-ease-entry); }
    @keyframes rs-detail-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    /* A7 新结果行回填（逐行 stagger 仅前 10 行，行内联 delay 变量） */
    .rs-enter { animation: rs-row-in var(--rs-motion-slow) var(--rs-ease-entry) both; animation-delay: var(--rs-stagger, 0ms); }
    @keyframes rs-row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
    /* A8 行移出淡出：退场中的行不再接受指针交互（列表行另有 aria-hidden 退出读屏） */
    .rs-leaving { animation: rs-row-out var(--rs-motion-base) var(--rs-ease-exit) both; pointer-events: none; }
    @keyframes rs-row-out { from { opacity: 1; } to { opacity: 0; } }
    /* A9 进行中 loader（唯一无限动画豁免之一） */
    .rs-spin { animation: rs-rotate 1s linear infinite; display: inline-flex; }
    @keyframes rs-rotate { to { transform: rotate(360deg); } }
    /* A13 未选岗位蓝圈脉冲一次 */
    .rs-pulse-job { animation: rs-pulse-once 320ms var(--rs-ease-entry); }
    @keyframes rs-pulse-once { 0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35); } 100% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0); } }
    /* A15 队列「查看」跳转行高亮脉冲（#eff3ff→transparent 两次往复） */
    .rs-jump { animation: rs-jump-pulse 240ms ease-in-out 2; }
    @keyframes rs-jump-pulse { from { background-color: var(--rs-primary-soft); } to { background-color: transparent; } }

    /* ===== <720px Sheet 抽屉（蓝图 §4/A11：宽 min(400px,100%-24px)） ===== */
    .rs-sheet-content { width: min(400px, calc(100% - 24px)); max-width: calc(100% - 24px); padding: 0; gap: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
    .rs-sheet-body { min-height: 0; }
    /* SheetTitle 只服务无障碍（aria-labelledby），不占视觉（详情头部自带标题） */
    .rs-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

    /* 处置按钮/确认框红强调（淘汰语义，§3.6） */
    .rs-action-destructive { color: var(--rs-red); }
    .rs-action-destructive:hover { color: var(--rs-red); background: var(--rs-red-soft); }
    .rs-reject-confirm-action [data-slot="alert-dialog-action"], [data-slot="alert-dialog-action"].rs-reject-confirm-action { background-color: var(--rs-red); color: #fff; }

    /* 统计条骨架 pill（与真实 pill 同规格防 CLS，A2 脉冲由 Skeleton 组件自带） */
    .rs-pill-skeleton { width: 74px; height: 24px; border-radius: var(--rs-pill-round); }

    /* 降级纪律（蓝图 §7）：reduced-motion 全量禁用，loader 保留但静止 */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
    }
    /* 断点主通道 = 容器查询（§4：iframe 视口≠宿主视口；不用视口媒体查询） */
    @container (max-width: 719px) {
      .rs-content { grid-template-columns: minmax(0, 1fr); }
      .rs-detail-panel { display: none; }
    }
    /* <560px：统计条横滚（基础样式已 overflow-x:auto）、抽取字段单列、头部标签收纳 */
    @container (max-width: 559px) {
      .rs-fields { grid-template-columns: minmax(0, 1fr); }
      .rs-header-label { display: none; }
    }
    /* JS 属性降级通道（ResizeObserver 不支持容器查询的环境，与容器查询同效） */
    .rs-shell[data-rs-width="xs"] .rs-header-label { display: none; }
    .rs-shell[data-rs-width="xs"] .rs-fields { grid-template-columns: minmax(0, 1fr); }
`

/**
 * 注入样式表到当前文档（iframe 内的插件文档）
 *
 * 只做「插入」：内容一律取 RS_STYLES_CSS 常量，便于 CI 静态扫描红线；
 * 幂等由 resume-screen-styles id 保证——main.tsx 在模块顶层调用一次，热重载或多实例挂载不重复插入。
 * 无 DOM 环境（单元测试跑在 node testEnvironment 下）不调用本函数，测试只断言常量字符串。
 */
export function injectStyles() {
  if (document.getElementById('resume-screen-styles')) return
  const style = document.createElement('style')
  style.id = 'resume-screen-styles'
  style.textContent = RS_STYLES_CSS
  document.head.appendChild(style)
}
