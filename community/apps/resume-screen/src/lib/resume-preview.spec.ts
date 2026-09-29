/**
 * 简历预览渲染与 HTML 消毒单元测试（spec §3.5）
 *
 * docx 走 mammoth 转 HTML 再过消毒管线，pdf 走 base64 直传；消毒是纯函数，
 * 逐条钉死「删什么、留什么」，防止将来放开白名单时无声削弱 XSS 防线。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderResumePreview, sanitizePreviewHtml } from './resume-preview'

const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name))

describe('sanitizePreviewHtml', () => {
  it('删除脚本与外部嵌入类标签整段（含内容）', () => {
    const dirty = '<p>正文</p><script>alert(1)</script><iframe src="https://evil"></iframe><object data="x"></object><embed src="x"><style>p{color:red}</style><link rel=stylesheet href=x>'
    const clean = sanitizePreviewHtml(dirty)
    expect(clean).toContain('正文')
    for (const token of ['<script', '<iframe', '<object', '<embed', '<style', '<link', 'alert(1)', 'evil']) {
      expect(clean.toLowerCase()).not.toContain(token)
    }
  })

  it('删除所有 on* 事件属性但保留标签与文本', () => {
    const clean = sanitizePreviewHtml('<p onclick="evil()" ONMOUSEOVER=evil()>安全文本</p>')
    expect(clean).toBe('<p>安全文本</p>')
  })

  it('把 javascript: 与 data:text/html 的 href/src 置空，保留正常链接', () => {
    const clean = sanitizePreviewHtml(
      '<a href="javascript:alert(1)">点我</a><a href="data:text/html,<script>x</script>">附件</a><a href="https://ok.example">正常</a>'
    )
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('data:text/html')
    expect(clean).toContain('https://ok.example')
  })

  // 远程 img src 按 spec §3.5 有意不过滤：该节把消毒口径穷举为「删 script/iframe/object/embed/link/style 整段
  // + 删所有 on* + 置空 javascript:/data:text/html 的 href/src + 保留常规排版标签与 img 的 data:image/*」，
  // 不含外链隐私过滤；收紧需先改 spec，本用例只钉住「内嵌图片不被误删」这一半。
  it('保留 mammoth 内嵌图片的 data:image/*', () => {
    const clean = sanitizePreviewHtml('<img src="data:image/png;base64,AAA"/>')
    expect(clean).toContain('data:image/png;base64,AAA')
  })

  it('删除条件注释与 CDATA（历史携带脚本的载体）', () => {
    const clean = sanitizePreviewHtml('<!--[if mso]><script>x()</script><![endif]--><!-- normal --><p>Y</p>')
    expect(clean).toBe('<p>Y</p>')
  })

  // 与上一条 href 用例分开的独立钉子：src 侧危险协议此前无任何样本，
  // 把清洗属性列表里的 src 删掉时 11 条仍全绿——本用例专门拦这类静默削弱。
  it('src 侧危险协议同样整条丢弃（img/a 的 src 与 xlink:href）', () => {
    const clean = sanitizePreviewHtml(
      '<img src="javascript:alert(1)"/><a href="https://ok.example">正常</a><svg><a xlink:href="JavaScript:alert(2)">x</a></svg>'
    )
    expect(clean).not.toContain('javascript:alert(1)')
    expect(clean.toLowerCase()).not.toContain('xlink:href')
    expect(clean).toContain('https://ok.example')
  })

  // 属性值字符实体绕过判定：浏览器在属性态解码一次字符引用，所以 &#106;avascript: 是真实 javascript: URL。
  // 判定层必须先解码再测；标签/事件属性那一层无需解码（HTML 分词先切标签，解码出的 < 不会重排成标签）。
  it('属性值里的数字实体编码不能绕过危险协议判定', () => {
    const entityHref = sanitizePreviewHtml('<a href="&#106;avascript:alert(1)">点我</a>')
    expect(entityHref).not.toContain('&#106;avascript')
    expect(entityHref).not.toContain('href')
    const entityHexHref = sanitizePreviewHtml('<a href="&#x6a;avascript&colon;alert(1)">点我</a>')
    expect(entityHexHref).not.toContain('href')
    // 反向对照：正文里已转义的尖括号必须仍是死文本，解码只用于判定、绝不写回 HTML
    const escapedText = sanitizePreviewHtml('<p>&lt;b&gt;加粗写法&lt;/b&gt;</p>')
    expect(escapedText).toBe('<p>&lt;b&gt;加粗写法&lt;/b&gt;</p>')
  })

  // scheme 内部制表符绕过：WHATWG URL 解析在进入 scheme 前会移除整串的 tab/LF/CR，
  // 所以 `java<TAB>script:` 与其实体形态 `java&#9;script:` 在浏览器眼里都是真实 javascript: URL；
  // 而 DANGEROUS_URL 的 ^\s* 只锚属性值前导，scheme 内空白无处匹配，必须靠判定前折叠才能挡住。
  // 明文 tab 形态可达：OOXML 超链接目标存于 document.xml.rels，XML 属性里的 &#9; 在 XML 解析阶段即成字面 tab，
  // mammoth 写 href 时不转义控制字符，故字面 tab 能活着走到最终 HTML。
  it('scheme 内的 tab（实体与明文两种形态）不能绕过危险协议判定', () => {
    const TAB = '\t'
    const entityForm = sanitizePreviewHtml('<a href="java&#9;script:alert(1)">点我</a>')
    expect(entityForm).not.toContain('href')
    expect(entityForm).not.toContain('alert(1)')
    const literalForm = sanitizePreviewHtml(`<a class="MsoHyperlink" title="外部链接" href="java${TAB}script:alert(2)">点我</a>`)
    expect(literalForm).not.toContain('href')
    expect(literalForm).not.toContain('alert(2)')
    // 良性对照：折叠只服务于协议判定，不得顺手删掉安全链接与常规排版属性
    const benign = sanitizePreviewHtml('<a class="MsoHyperlink" title="公司主页" href="https://ok.example">正常</a>')
    expect(benign).toBe('<a class="MsoHyperlink" title="公司主页" href="https://ok.example">正常</a>')
  })

  // 常规属性存活：spec §3.5 保留「常规排版标签与属性」，此前该保证的输入完全不含属性，
  // 属性白名单被收窄时无人报警；同时钉住 data-* 不被误删（清洗列表曾因包含 data 而误伤合法自定义属性）。
  it('常规排版属性原样保留（class/title/id/target/data-*）', () => {
    const html = '<p class="MsoNormal" title="技能栏" id="sec1" data-source="docx" data-row="3">经验</p>'
    expect(sanitizePreviewHtml(html)).toBe(html)
    // 单独钉 data：清洗属性名列表曾包含 data 项（其唯一"用途"是 <embed data=…>，而该标签已被 DROP_TAGS 整段删除）。
    // 这条精确相等断言保证「把 data 加回清洗列表」立刻变红，防止将来误把 data- 前缀当危险项。
    expect(sanitizePreviewHtml('<td data="x">单元格</td>')).toBe('<td data="x">单元格</td>')
  })
})

describe('renderResumePreview', () => {
  it('docx → 消毒后的 HTML，正文可读', async () => {
    const payload = await renderResumePreview(fixture('resume-minimal.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(payload.kind).toBe('html')
    if (payload.kind === 'html') {
      expect(payload.html).toContain('张三')
      expect(payload.html.toLowerCase()).not.toContain('<script')
    }
  })

  it('pdf → base64 可无损还原原始字节（iframe 侧转 Blob 的前提）', async () => {
    const bytes = fixture('resume-minimal.pdf')
    const payload = await renderResumePreview(bytes, 'application/pdf')
    expect(payload.kind).toBe('pdf')
    if (payload.kind === 'pdf') {
      expect(Buffer.from(payload.base64, 'base64').equals(bytes)).toBe(true)
    }
  })

  // 断言走类型化 reason：本用例字节头部并非 %PDF-，只有「尺寸闸先于魔数闸」才得到 file_too_large；
  // 若顺序被颠倒，reason 会漂成 unsupported_format —— 这条钉子就是任务书列出的硬约束。
  it('超过 10MB 的文件在 action 层之前拒绝（尺寸闸与上传同值）', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    big.write('%PDF-1.7', 0)
    await expect(renderResumePreview(big, 'application/pdf')).rejects.toMatchObject({
      reason: 'file_too_large'
    })
  })

  // 断言走类型化字段 reason：本仓禁止从展示文案推断机器可读区分（文案属 UI 资产，随时可改）
  it('既非 docx 也非 pdf 的 mime 直接拒绝', async () => {
    await expect(renderResumePreview(Buffer.from('hello'), 'text/plain')).rejects.toMatchObject({
      reason: 'unsupported_format'
    })
  })

  // 断言走类型化 reason：toBeInstanceOf 对四种 reason 全真，删掉 try/catch 之外的分支照样绿；
  // 这里钉的是 R-P39 的承诺——junk zip 过掉魔数闸后必须由 mammoth 异常折叠成 parse_error。
  it('损坏的 docx 走 parse_error 而不是静默返回空 HTML', async () => {
    const junk = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not-a-real-zip')])
    await expect(
      renderResumePreview(junk, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).rejects.toMatchObject({
      reason: 'parse_error'
    })
  })
})
