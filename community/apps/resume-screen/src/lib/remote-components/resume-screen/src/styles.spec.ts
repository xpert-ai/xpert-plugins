/**
 * 样式表静态契约测试（spec §5.2 浅色钉死 / §5.6 层级单一真源）
 *
 * 不依赖 DOM：injectStyles 在 iframe 里写 <style>，浏览器外无法跑，但样式串本身是
 * 导出的常量字符串——钉死「裸 shadcn 名必须在本表声明出来」与「禁止裸 z-index」
 * 两条红线在 CI 层即可验证，比人眼审阅可靠（真机对比度由 T20 的 computed 检查兜底）。
 *
 * 扫描器口径：z-index / font-size 两条红线先剔除 CSS 注释再匹配，且 z-index 走整行匹配，
 * 避免注释里的数字被当声明读、`z-index :5` 这类畸形写法静默双绿（本文件是 T14–T17 的闸门）。
 */
import { RS_STYLES_CSS } from './styles'
import { RS_LAYERS } from './utils'

// shadcn 语义 token 清单：宿主 createRemoteTheme() 按这些裸名读取主题色，iframe 内不声明
// 就取不到值、只能回落 OS Canvas/CanvasText（P2 对比度塌方的根因）；!important 的对手是
// app.css 的同名 :root 声明与其 .dark 块，不是宿主的行内 --xui-color-*
const SHADCN_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  '--destructive',
  '--destructive-foreground',
  '--border',
  '--input',
  '--ring'
]

// 字号红线口径：root font-size = 16px（宿主未改写），11px 即 0.6875rem；容差只用于吸收浮点表示误差
const ROOT_FONT_SIZE_PX = 16
const FONT_MIN_PX = 11
const FONT_TOLERANCE_PX = 0.001

/**
 * 剔除 CSS 块注释后的样式串
 *
 * 样式串里有「注释内嵌声明」的写法（如 .rs-empty 那行把 animation 写在说明注释里），
 * 直接全文匹配会把注释中的数字读成真实声明；红线扫描一律先剥注释再取数。
 */
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

// ===== WCAG 对比度计算（T20 修复轮 1：关键前景色对白底 ≥4.5:1 的静态防回退） =====

/** WCAG 相对亮度：sRGB 线性光三通道（0–1）→ 加权亮度 */
function relativeLuminance(linear: number[]): number {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

/** 目标色对白底（#ffffff）的对比度；linear 为该色线性光通道 */
function contrastOnWhite(linear: number[]): number {
  return 1.05 / (relativeLuminance(linear) + 0.05)
}

/** hex（#rrggbb）→ 线性光：归一化后做 sRGB 传递函数逆变换 */
function srgbHexToLinear(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16)
  const decode = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4)
  return [decode(((n >> 16) & 255) / 255), decode(((n >> 8) & 255) / 255), decode((n & 255) / 255)]
}

/** oklch（CSS Color 4）→ 线性 sRGB 三通道；超出色域通道按 0–1 裁剪（与浏览器同口径） */
function oklchToLinear(l: number, c: number, hDeg: number): number[] {
  const h = (hDeg * Math.PI) / 180
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  return [
    clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)
  ]
}

describe('RS_STYLES_CSS 浅色钉死', () => {
  it('color-scheme 钉在 light（表单控件/滚动条跟随浅色原生渲染）', () => {
    expect(RS_STYLES_CSS).toMatch(/color-scheme:\s*light\s*!important/)
  })

  it.each(SHADCN_TOKENS)('%s 以 !important 声明（压过 app.css 同名 :root 声明，并防 TOKEN_MAP 日后扩到裸名）', (token) => {
    expect(RS_STYLES_CSS).toMatch(new RegExp(`${token}:\\s*[^;]+!important`))
  })

  it('不存在 .dark 覆写块（宿主用 data-theme 属性，.dark 选择器在 iframe 内是死代码）', () => {
    expect(RS_STYLES_CSS).not.toMatch(/\.dark\s*\{/)
  })

  // T20 修复轮 1（E2E 项 4 防回退）：抽屉正文灰色标签（--rs-soft）与页脚「淘汰」红色前景
  // （--destructive，经 var(--rs-red) 消费）曾实测 2.54:1 / 4.06:1，低于 WCAG AA 红线 4.5:1。
  // 本条从样式串取真实声明值计算（而非硬编码 hex），色值一旦回退此处先于真机变红
  it('抽屉灰标与页脚红前景对白底对比度 ≥4.5:1（WCAG 相对亮度公式，按样式串真实值计算）', () => {
    const css = stripCssComments(RS_STYLES_CSS)

    // --rs-soft 为 hex 字面值，直接按 sRGB → 线性光 → 亮度计算
    const softHex = /--rs-soft:\s*(#[0-9a-fA-F]{6})\s*;/.exec(css)?.[1] ?? ''
    expect(softHex).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(contrastOnWhite(srgbHexToLinear(softHex))).toBeGreaterThanOrEqual(4.5)

    // --destructive 为 oklch 取值（抽屉/弹窗红色前景的唯一源头），先转线性 sRGB 再计算
    const destructive = /--destructive:\s*oklch\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\)/.exec(css)
    expect(destructive).not.toBeNull()
    const [lightness, chroma, hue] = destructive!.slice(1).map(Number)
    expect(contrastOnWhite(oklchToLinear(lightness, chroma, hue))).toBeGreaterThanOrEqual(4.5)
  })

  // 字号下限（§5.2）：低于 11px 的正文/标签在浅色小字下不可读，红线级别
  // 两条通道都要拦：px 字面值，以及 rem 字面值（root font-size = 16px 前提下 11px = 0.6875rem）
  it('全站 font-size 字面值不得小于 11px（px 与 rem 双通道）', () => {
    const css = stripCssComments(RS_STYLES_CSS)
    const pxSizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]))
    expect(pxSizes.length).toBeGreaterThan(0)
    expect(pxSizes.filter((size) => size < FONT_MIN_PX)).toEqual([])
    // rem 通道：font-size: <n>rem 直接折算为 px，防止绕过 px 红线写小 rem
    const remSizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)rem/g)].map((match) => Number(match[1]) * ROOT_FONT_SIZE_PX)
    expect(remSizes.filter((size) => size < FONT_MIN_PX - FONT_TOLERANCE_PX)).toEqual([])
  })

  // 字号 token 通道（活路径：[data-slot=...] 用 font-size: var(--rs-font-control)）：
  // 上一条例子只匹配 font-size: 后的字面值，token 定义改小不会变红——本条补齐下限
  it('以 var() 消费的字号 token（rem 取值）折算后不得小于 11px', () => {
    const css = stripCssComments(RS_STYLES_CSS)
    // 收集被 font-size: var(--x) 实际引用的 token 名，只看「活」的字号通道，不误伤非字号变量
    const consumed = new Set([...css.matchAll(/font-size:\s*var\((--[\w-]+)\)/g)].map((match) => match[1]))
    const offenders: string[] = []
    for (const token of consumed) {
      const definition = new RegExp(`${token}:\\s*(\\d+(?:\\.\\d+)?)rem`, 'g')
      for (const match of css.matchAll(definition)) {
        const px = Number(match[1]) * ROOT_FONT_SIZE_PX
        if (px < FONT_MIN_PX - FONT_TOLERANCE_PX) offenders.push(`${token}=${match[1]}rem≈${px}px`)
      }
    }
    // 现网确有该通道（--rs-font-control: 0.8125rem ≈13px），取不到样本说明红线被架空
    expect(consumed.size).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})

describe('浮层与抽屉静态契约（spec §5.5/§5.6）', () => {
  it('抽屉宽度钉死 460 上限且随容器收口', () => {
    expect(RS_STYLES_CSS).toMatch(/\.rs-sheet-content\s*\{[^}]*width:\s*min\(460px,\s*calc\(100% - 24px\)\)/)
  })

  it('xs 态抽屉满宽（无残留 460 上限）', () => {
    expect(RS_STYLES_CSS).toMatch(/\.rs-sheet-content\.is-full\s*\{[^}]*width:\s*100%/s)
  })

  it('遮罩与内容各自归位到刻度层：sheet/dialog/popover 三层不混用', () => {
    expect(RS_STYLES_CSS).toMatch(/\[data-slot="sheet-overlay"\][^{]*\{[^}]*z-index:\s*var\(--rs-layer-sheet-overlay\)/s)
    expect(RS_STYLES_CSS).toMatch(/\[data-slot="sheet-content"\][^{]*\{[^}]*z-index:\s*var\(--rs-layer-sheet\)/s)
    expect(RS_STYLES_CSS).toMatch(/\[data-slot="dialog-content"\][^{]*\{[^}]*z-index:\s*var\(--rs-layer-dialog\)/s)
    expect(RS_STYLES_CSS).toMatch(/z-index:\s*var\(--rs-layer-popper\)/)
  })

  it('抽屉遮罩有模糊脱层（区分于 dialog 的纯压暗）', () => {
    // 锚定 sheet-overlay 规则本身：blur 若只泛匹配全文，dialog 行的 blur 会替 sheet 挡红（mutation ② 判伪依据）
    expect(RS_STYLES_CSS).toMatch(/\[data-slot="sheet-overlay"\][^{]*\{[^}]*backdrop-filter:\s*blur\(2px\)/)
  })

  it('浮层内容不落在 .rs-shell 的 overflow 裁切区里（一律由 Radix portal 挂 body）', () => {
    // Radix portal 容器在 body 下；样式里不得出现给浮层加 shell 内定位的写法
    expect(RS_STYLES_CSS).not.toMatch(/\.rs-shell\s+\[data-slot="(dialog|sheet|popover|select|dropdown|tooltip)/)
  })
})

describe('RS_STYLES_CSS 浮层层级单一真源', () => {
  // 扫描器口径：剥注释 + 整行匹配。旧写法有双绿绕过——`z-index :5`（冒号前置空格）
  // 两条正则都匹配不到；`z-index: calc(var(--x) + 1)` 会被 [^;]+ 贪婪放过当「走了变量」。
  it('样式串里没有一处裸 z-index 数字', () => {
    const css = stripCssComments(RS_STYLES_CSS)
    // 冒号两侧可有空白、值可含 calc()/负号，只要最终落在数字字面量上就算违规
    expect(css.match(/z-index\s*:\s*[^;{}]*?-?\d/g)).toBeNull()
  })

  it('每个 z-index 都引用 --rs-layer-* 变量', () => {
    const css = stripCssComments(RS_STYLES_CSS)
    // 宽松计数：出现 z-index 关键字的声明总数（整行匹配，含畸形写法）
    const declared = [...css.matchAll(/z-index\s*:[^;{}]*/g)]
    // 严格计数：唯一合规形态——值恰好是一个 --rs-layer-* 变量引用
    const compliant = [...css.matchAll(/z-index\s*:\s*var\(--rs-layer-[a-z-]+\)\s*(?=[;{}])/g)]
    expect(declared.length).toBeGreaterThan(0)
    // 两数不等说明存在「写了 z-index 但没走 rs-layer 变量」的漏网声明
    expect(compliant.length).toBe(declared.length)
  })

  it('RS_LAYERS 每一项都有同名 CSS 变量落点，且数值严格递增', () => {
    const entries = Object.entries(RS_LAYERS)
    for (const [name, value] of entries) {
      expect(RS_STYLES_CSS).toMatch(new RegExp(`--rs-layer-${name}:\\s*${value}\\s*!important`))
    }
    const numbers = entries.map(([, value]) => value)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))

    // CSS 侧解析出的全部七档（含伴生遮罩）也必须升序：任一档位被单独改大都会在这里变红，
    // 而不是只校验 TS 表有序（旧断言对 CSS 侧数字无约束，overlay 写 41 反盖面板照样全绿）
    const cssLayers = [...stripCssComments(RS_STYLES_CSS).matchAll(/--rs-layer-([a-z-]+):\s*(\d+)\s*!important/g)]
    expect(cssLayers.length).toBe(entries.length + 1)
    // 按 RS_LAYERS 的语义升序取 CSS 侧数值比对（伴生遮罩在样式里紧挨 sheet 书写，
    // 书写次序不代表层级次序），任一档位被单独改大都会在这里变红
    const cssValueByName = new Map(cssLayers.map((match) => [match[1], Number(match[2])]))
    const semanticOrder = entries.map(([name]) => cssValueByName.get(name))
    expect(semanticOrder).toEqual([...entries].map(([, value]) => value))
    expect(semanticOrder).toEqual([...semanticOrder].sort((a, b) => a - b))

    // 遮罩单独一档：由 sheet 派生（sheet - 1），必须严格落在 sticky 之上、sheet 面板之下
    // （抽屉关闭动画中不得反过来压住面板），故不独立取数、只做区间断言
    const overlay = Number(cssLayers.find((match) => match[1] === 'sheet-overlay')?.[2])
    expect(Number.isFinite(overlay)).toBe(true)
    expect(overlay).toBeGreaterThan(RS_LAYERS.sticky)
    expect(overlay).toBeLessThan(RS_LAYERS.sheet)
  })
})
