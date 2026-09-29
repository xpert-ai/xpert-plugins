/**
 * 样式表静态契约测试（spec §5.2 浅色钉死 / §5.6 层级单一真源）
 *
 * 不依赖 DOM：injectStyles 在 iframe 里写 <style>，浏览器外无法跑，但样式串本身是
 * 导出的常量字符串——钉死「宿主 inline 变量只能被 !important 覆写」与「禁止裸 z-index」
 * 两条红线在 CI 层即可验证，比人眼审阅可靠（真机对比度由 T20 的 computed 检查兜底）。
 */
import { RS_STYLES_CSS } from './styles'
import { RS_LAYERS } from './utils'

// shadcn 语义 token 清单：这些变量由宿主 bootstrap 以 inline style 写在 documentElement 上，
// iframe 内不 !important 就永远吃宿主深色（P2 对比度塌方的根因）
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

describe('RS_STYLES_CSS 浅色钉死', () => {
  it('color-scheme 钉在 light（表单控件/滚动条跟随浅色原生渲染）', () => {
    expect(RS_STYLES_CSS).toMatch(/color-scheme:\s*light\s*!important/)
  })

  it.each(SHADCN_TOKENS)('%s 以 !important 声明（宿主 inline 变量的唯一覆写通道）', (token) => {
    expect(RS_STYLES_CSS).toMatch(new RegExp(`${token}:\\s*[^;]+!important`))
  })

  it('不存在 .dark 覆写块（宿主用 data-theme 属性，.dark 选择器在 iframe 内是死代码）', () => {
    expect(RS_STYLES_CSS).not.toMatch(/\.dark\s*\{/)
  })

  // 字号下限（§5.2）：低于 11px 的正文/标签在浅色小字下不可读，红线级别；rem 取值换算后 ≥13px 不受影响
  it('全站 font-size 字面值不得小于 11px', () => {
    const pxSizes = [...RS_STYLES_CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]))
    expect(pxSizes.length).toBeGreaterThan(0)
    expect(pxSizes.filter((size) => size < 11)).toEqual([])
  })
})

describe('RS_STYLES_CSS 浮层层级单一真源', () => {
  it('样式串里没有一处裸 z-index 数字', () => {
    expect(RS_STYLES_CSS.match(/z-index:\s*-?\d/g)).toBeNull()
  })

  it('每个 z-index 都引用 --rs-layer-* 变量', () => {
    const uses = [...RS_STYLES_CSS.matchAll(/z-index:\s*([^;]+);/g)]
    expect(uses.length).toBeGreaterThan(0)
    for (const use of uses) {
      expect(use[1].trim()).toMatch(/^var\(--rs-layer-[a-z-]+\)$/)
    }
  })

  it('RS_LAYERS 每一项都有同名 CSS 变量落点，且数值严格递增', () => {
    const entries = Object.entries(RS_LAYERS)
    for (const [name, value] of entries) {
      expect(RS_STYLES_CSS).toMatch(new RegExp(`--rs-layer-${name}:\\s*${value}\\s*!important`))
    }
    const numbers = entries.map(([, value]) => value)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
    // 遮罩单独一档：数值 39 落在 sticky(10) 之上、sheet 面板(40)之下（抽屉关闭时不得压住面板）
    expect(RS_STYLES_CSS).toMatch(/--rs-layer-sheet-overlay:\s*\d+\s*!important/)
  })
})
