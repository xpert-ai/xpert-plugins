/**
 * 测试资产生成脚本（一次性运行，产物提交入库）：
 *   node src/lib/__fixtures__/generate-fixtures.mjs
 * 产出 4 个 fixture（均 <4KB），供 resume-file-parser.spec.ts 使用：
 * - resume-minimal.docx：jszip store 模式打包最小 OOXML 三件套，正文两段 <w:t>
 * - resume-minimal.pdf：手写单页 PDF（xref 偏移真实计算），含 "Li Si, 3 years Java, master degree"
 * - resume-empty.pdf：同模板但 Tj 内容为单空格，模拟无文本层扫描件
 * - fake-encrypted.pdf：trailer 挂 /Encrypt + 假 Standard 加密字典（V1/R2，O/U 为占位字节），
 *   pdfjs 空口令校验失败即抛 PasswordException("No password given")，命中解析器的 encrypted 分支
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const DIR = fileURLToPath(new URL('.', import.meta.url))

/** 构造最小 docx：zip(store) + [Content_Types].xml / _rels/.rels / word/document.xml 三件套 */
async function buildDocx() {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>'
  // 正文含两段 <w:t>（同段两个 run，mammoth extractRawText 输出以段落分隔）
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    '<w:p><w:r><w:t>张三 5年经验 </w:t></w:r><w:r><w:t>React工程师 本科</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>联系方式 13800000000</w:t></w:r></w:p>' +
    '</w:body></w:document>'
  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', rels)
  zip.file('word/document.xml', document)
  // store 模式免压缩，保证产物字节稳定可复现
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
}

/**
 * 手写单页 PDF：逐对象累加偏移量生成真实 xref 表。
 * 仅用 ASCII/latin1 字符，字符串长度=字节数，偏移计算严格成立。
 * @param {string} textOp Tj 指令内的文本（括号需已转义）
 * @param {{encrypt?: boolean}} opts encrypt=true 时对象 5 换成假 Standard 加密字典并挂进 trailer
 */
function buildPdf(textOp, opts = {}) {
  const stream = `BT /F1 12 Tf 40 750 Td (${textOp}) Tj ET`
  const fontObj = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  // 假加密字典：O/U 用 32 字节占位十六进制串；V1/R2 走 RC4-40 校验路径，
  // 空口令推导的 checkData 与占位 U 必然不匹配 → pdfjs 抛 "No password given"
  const encHex = '41'.repeat(32)
  const userHex = '42'.repeat(32)
  const encryptObj = `5 0 obj\n<< /Filter /Standard /V 1 /R 2 /Length 40 /P -12 /O <${encHex}> /U <${userHex}> >>\nendobj\n`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    opts.encrypt ? encryptObj : fontObj
  ]
  let out = '%PDF-1.7\n'
  const offsets = []
  for (const body of objects) {
    offsets.push(out.length)
    out += body
  }
  const xrefOffset = out.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  const trailerEntries = opts.encrypt
    ? '<< /Size 6 /Root 1 0 R /Encrypt 5 0 R /ID [<deadbeef> <deadbeef>] >>'
    : '<< /Size 6 /Root 1 0 R >>'
  out += xref + `trailer\n${trailerEntries}\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

async function main() {
  writeFileSync(join(DIR, 'resume-minimal.docx'), await buildDocx())
  writeFileSync(join(DIR, 'resume-minimal.pdf'), buildPdf('Li Si, 3 years Java, master degree'))
  // 单空格文本层：模拟无 OCR 的扫描件，抽取结果为空白
  writeFileSync(join(DIR, 'resume-empty.pdf'), buildPdf(' '))
  writeFileSync(join(DIR, 'fake-encrypted.pdf'), buildPdf('secret content', { encrypt: true }))
  console.log('fixtures 生成完成：resume-minimal.docx / resume-minimal.pdf / resume-empty.pdf / fake-encrypted.pdf')
}

void main()
