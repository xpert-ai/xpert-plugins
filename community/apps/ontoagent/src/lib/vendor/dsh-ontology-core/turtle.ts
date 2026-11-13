/**
 * 极小 Turtle 解析器：只支持 SHACL 形状图需要的那一小撮语法。纯计算（无 IO）。
 *
 * 支持的方言（超出即报错，不静默降级 —— AGENTS §3.5）：
 *   @prefix / PREFIX 声明（前缀**不展开**，保留 sh:minCount 这种前缀名做规范键）
 *   主语谓宾列表、`;` 与 `,` 省略、空白节点属性表 `[ ... ]`、集合 `( ... )`、
 *   带 @lang 或 ^^datatype 的字面量、数字、true/false、`a`（= rdf:type）。
 */

export type Term =
  | { kind: 'iri'; value: string }
  | { kind: 'bnode'; id: string }
  | { kind: 'literal'; value: string; datatype?: string; lang?: string }
  | { kind: 'list'; items: Term[] }

export interface GraphTriple { s: Term; p: string; o: Term }

export interface ParseResult { prefixes: Map<string, string>; triples: GraphTriple[] }

/** 词的规范键：iri/bnode/literal 共用一套，便于按主语分组。 */
export function termKey(t: Term): string {
  if (t.kind === 'iri') return 'iri:' + t.value
  if (t.kind === 'bnode') return 'bnode:' + t.id
  if (t.kind === 'literal') return 'lit:' + t.value
  return 'list:' + t.items.map(termKey).join(',')
}

type TokKind = 'iri' | 'pname' | 'lit' | 'num' | 'bool' | 'bnode' | 'punct'
interface Tok { kind: TokKind; value: string; datatype?: string; lang?: string }

const PUNCT = new Set([';', ',', '.', '[', ']', '(', ')'])

/** 扫描一个字符串字面量：支持 """长字符串""" 与反斜杠转义（真实本体文件里两者都常见）。 */
function scanString(text: string, start: number): { value: string; end: number } {
  const q = text[start]
  const delim = text.startsWith(q + q + q, start) ? q + q + q : q
  let i = start + delim.length
  let out = ''
  while (i < text.length) {
    if (text.startsWith(delim, i)) return { value: out, end: i + delim.length }
    const c = text[i]
    if (c === '\\') {
      const n = text[i + 1]
      if (n === 'n') out += '\n'
      else if (n === 't') out += '\t'
      else if (n === 'r') out += '\r'
      else if (n === 'u') out += String.fromCharCode(parseInt(text.slice(i + 2, i + 6), 16))
      else out += n
      i += n === 'u' ? 6 : 2
      continue
    }
    out += c
    i += 1
  }
  throw new Error('Turtle: 未闭合的字符串 @' + start)
}

function tokenize(text: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (c === '#' ) { while (i < n && text[i] !== '\n') i += 1; continue }
    if (/\s/.test(c)) { i += 1; continue }
    if (PUNCT.has(c)) { out.push({ kind: 'punct', value: c }); i += 1; continue }
    if (c === '<') {
      const end = text.indexOf('>', i)
      if (end < 0) throw new Error('Turtle: 未闭合的 IRI @' + i)
      out.push({ kind: 'iri', value: text.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (c === '"' || c === "'") {
      const scanned = scanString(text, i)
      const value = scanned.value
      let j = scanned.end
      let datatype: string | undefined
      let lang: string | undefined
      if (text.startsWith('@', j)) { const m = /^@([A-Za-z-]+)/.exec(text.slice(j)); if (m === null) throw new Error('Turtle: 坏 lang tag'); lang = m[1]; j += m[0].length }
      else if (text.startsWith('^^', j)) { const m = /^\^\^([A-Za-z][\w-]*:[\w.-]+|<[^>]+>)/.exec(text.slice(j)); if (m === null) throw new Error('Turtle: 坏 datatype'); datatype = m[1].replace(/^<|>$/g, ''); j += m[0].length }
      out.push({ kind: 'lit', value, datatype, lang })
      i = j
      continue
    }
    const rest = text.slice(i)
    const mAt = /^@[A-Za-z][\w-]*/.exec(rest)
    if (mAt !== null) { out.push({ kind: 'pname', value: mAt[0] }); i += mAt[0].length; continue }
    const mNum = /^-?\d+(\.\d+)?/.exec(rest)
    if (mNum !== null && /[\d-]/.test(c)) { out.push({ kind: 'num', value: mNum[0] }); i += mNum[0].length; continue }
    const mBool = /^(true|false)\b/.exec(rest)
    if (mBool !== null) { out.push({ kind: 'bool', value: mBool[1] }); i += mBool[0].length; continue }
    const mBlank = /^_:[A-Za-z0-9_-]+/.exec(rest)
    if (mBlank !== null) { out.push({ kind: 'bnode', value: mBlank[0].slice(2) }); i += mBlank[0].length; continue }
    const mPname = /^([A-Za-z][\w-]*):([\w./#-]*)/.exec(rest)
    if (mPname !== null) { out.push({ kind: 'pname', value: mPname[1] + ':' + mPname[2] }); i += mPname[0].length; continue }
    if (/^[A-Za-z]/.test(c)) { const mA = /^[A-Za-z][\w-]*/.exec(rest) as RegExpExecArray; out.push({ kind: 'pname', value: mA[0] }); i += mA[0].length; continue }
    throw new Error('Turtle: 无法识别的字符 ' + JSON.stringify(c) + ' @' + i)
  }
  return out
}

class Cursor {
  private readonly toks: Tok[]
  private pos = 0
  private bnodeSeq = 0
  private readonly prefixes = new Map<string, string>()
  private readonly triples: GraphTriple[] = []

  constructor(toks: Tok[]) { this.toks = toks }

  private peek(): Tok | undefined { return this.toks[this.pos] }
  private next(): Tok { const t = this.toks[this.pos]; this.pos += 1; return t }
  private expect(value: string): void {
    const t = this.toks[this.pos]
    if (t === undefined || t.value !== value) throw new Error('Turtle: 期望 ' + JSON.stringify(value) + '，得到 ' + JSON.stringify(t))
    this.pos += 1
  }

  /** 跳过 @prefix / @base（及 SPARQL 风格 PREFIX / BASE）声明。FIBO 真实文件第一条就是 @base。 */
  private skipPrefixes(): void {
    for (;;) {
      const t = this.peek()
      if (t === undefined) return
      if (t.kind !== 'pname') return
      const kw = t.value.toLowerCase()
      if (kw !== '@prefix' && kw !== '@base' && kw !== 'prefix' && kw !== 'base') return
      this.next()
      const isPrefixDecl = kw === '@prefix' || kw === 'prefix'
      if (isPrefixDecl) {
        const name = this.next()
        const iriTok = this.next()
        this.prefixes.set(name.value.replace(/:$/, ''), iriTok.value)
      } else {
        const iriTok = this.next()
        this.prefixes.set('', iriTok.value)
      }
      const end = this.peek()
      if (end !== undefined && end.kind === 'punct' && end.value === '.') this.next()
    }
  }

  private iriOrBnode(): Term {
    const t = this.next()
    if (t.kind === 'pname' || t.kind === 'iri') return { kind: 'iri', value: t.value }
    if (t.kind === 'bnode') return { kind: 'bnode', id: t.value }
    throw new Error('Turtle: 期望主语，得到 ' + JSON.stringify(t))
  }

  private predicate(): string {
    const t = this.next()
    if (t.kind === 'pname' && t.value === 'a') return 'rdf:type'
    if (t.kind === 'pname' || t.kind === 'iri') return t.value
    throw new Error('Turtle: 期望谓词，得到 ' + JSON.stringify(t))
  }

  private object(): Term {
    const t = this.peek()
    if (t === undefined) throw new Error('Turtle: 对象缺失')
    if (t.kind === 'punct' && t.value === '[') return this.blankNodePropertyList()
    if (t.kind === 'punct' && t.value === '(') return this.collection()
    this.next()
    if (t.kind === 'pname' || t.kind === 'iri') return { kind: 'iri', value: t.value }
    if (t.kind === 'bnode') return { kind: 'bnode', id: t.value }
    if (t.kind === 'num') return { kind: 'literal', value: t.value, datatype: t.value.includes('.') ? 'xsd:decimal' : 'xsd:integer' }
    if (t.kind === 'bool') return { kind: 'literal', value: t.value, datatype: 'xsd:boolean' }
    return { kind: 'literal', value: t.value, datatype: t.datatype, lang: t.lang }
  }

  private blankNodePropertyList(): Term {
    this.expect('[')
    this.bnodeSeq += 1
    const node: Term = { kind: 'bnode', id: 'anon' + this.bnodeSeq }
    if (this.peek() !== undefined && this.peek()?.value === ']') { this.next(); return node }
    this.predicateObjectList(node, ']')
    this.expect(']')
    return node
  }

  private collection(): Term {
    this.expect('(')
    const items: Term[] = []
    while (this.peek() !== undefined && this.peek()?.value !== ')') items.push(this.object())
    this.expect(')')
    return { kind: 'list', items }
  }

  private predicateObjectList(subject: Term, stop: string): void {
    for (;;) {
      const t = this.peek()
      if (t === undefined || t.value === stop) return
      const p = this.predicate()
      for (;;) {
        this.triples.push({ s: subject, p, o: this.object() })
        const sep = this.peek()
        if (sep !== undefined && sep.value === ',') { this.next(); continue }
        break
      }
      const sep = this.peek()
      if (sep !== undefined && sep.value === ';') {
        this.next()
        const after = this.peek()
        if (after !== undefined && after.value === stop) return
        continue
      }
      return
    }
  }

  run(): ParseResult {
    this.skipPrefixes()
    for (;;) {
      const t = this.peek()
      if (t === undefined) break
      if (t.kind === 'punct' && t.value === '.') { this.next(); continue }
      const subject = this.iriOrBnode()
      this.predicateObjectList(subject, '.')
      const dot = this.peek()
      if (dot !== undefined && dot.value === '.') this.next()
    }
    return { prefixes: this.prefixes, triples: this.triples }
  }
}

/** 解析 Turtle 文本为三元组（前缀名保持原样，不展开）。 */
export function parseTurtle(text: string): ParseResult {
  return new Cursor(tokenize(text)).run()
}

/** 按主语分组，供形状图构造使用。 */
export function groupBySubject(triples: GraphTriple[]): Map<string, GraphTriple[]> {
  const out = new Map<string, GraphTriple[]>()
  for (const t of triples) {
    const k = termKey(t.s)
    const arr = out.get(k) ?? []
    arr.push(t)
    out.set(k, arr)
  }
  return out
}

/** 取某主语在某谓词下的全部对象。 */
export function objectsOf(triples: GraphTriple[], subject: Term, predicate: string): Term[] {
  const k = termKey(subject)
  return triples.filter((t) => t.p === predicate && termKey(t.s) === k).map((t) => t.o)
}