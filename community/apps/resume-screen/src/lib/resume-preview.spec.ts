/**
 * 简历预览渲染与 HTML 消毒单元测试（spec §3.5）
 *
 * docx 走 mammoth 转 HTML 再过消毒管线，pdf 走 base64 直传；消毒是纯函数，
 * 逐条钉死「删什么、留什么」，防止将来放开白名单时无声削弱 XSS 防线。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderResumePreview, sanitizePreviewHtml } from './resume-preview'
import { ResumeFileParseError } from './resume-file-parser'

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

  it('常规排版标签与属性原样保留（不破坏简历可读性）', () => {
    const html = '<h1><strong>张三</strong></h1><table><tr><td>经验</td></tr></table><ul><li>React</li></ul><br/>'
    expect(sanitizePreviewHtml(html)).toBe(html)
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

  it('超过 10MB 的文件在 action 层之前拒绝（尺寸闸与上传同值）', async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    big.write('%PDF-1.7', 0)
    await expect(renderResumePreview(big, 'application/pdf')).rejects.toBeInstanceOf(ResumeFileParseError)
  })

  // 断言走类型化字段 reason：本仓禁止从展示文案推断机器可读区分（文案属 UI 资产，随时可改）
  it('既非 docx 也非 pdf 的 mime 直接拒绝', async () => {
    await expect(renderResumePreview(Buffer.from('hello'), 'text/plain')).rejects.toMatchObject({
      reason: 'unsupported_format'
    })
  })

  it('损坏的 docx 走 parse_error 而不是静默返回空 HTML', async () => {
    const junk = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('not-a-real-zip')])
    await expect(
      renderResumePreview(junk, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    ).rejects.toBeInstanceOf(ResumeFileParseError)
  })
})
