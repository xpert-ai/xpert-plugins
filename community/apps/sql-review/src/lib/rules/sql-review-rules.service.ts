import { Injectable } from '@nestjs/common'
import type { SqlReviewDialect, SqlReviewFindingPayload } from '../types'

/**
 * Deterministic rule engine for SQL review.
 *
 * Rules quote the offending fragment (originalText + location) as evidence so the
 * AI analyst and human reviewers always see what triggered the finding. The engine
 * is intentionally conservative: only flag what a rule can prove from the text.
 */
export interface SqlReviewRuleDef {
  id: string
  category: SqlReviewFindingPayload['category']
  severity: SqlReviewFindingPayload['severity']
  title: { zh: string; en: string }
  match: (ctx: RuleContext) => SqlReviewRuleHit[] | SqlReviewRuleHit[]
}

export interface RuleContext {
  sql: string
  lines: string[]
  dialect: SqlReviewDialect
  ddlContext?: string
}

export interface SqlReviewRuleHit {
  location: string
  originalText: string
  explanation: string
  suggestion: string
}

interface RegexRuleOptions {
  id: string
  category: SqlReviewFindingPayload['category']
  severity: SqlReviewFindingPayload['severity']
  title: { zh: string; en: string }
  pattern: RegExp
  explanation: string
  suggestion: string
  quoteFrom?: (m: RegExpExecArray) => string
  dialects?: SqlReviewDialect[]
  minLine?: number
}

function lineOf(lines: string[], predicate: (line: string) => boolean): number {
  for (let i = 0; i < lines.length; i++) {
    if (predicate(lines[i])) return i + 1
  }
  return 1
}

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
}

function firstKeyword(text: string): string {
  const m = /(?:^|[\s(;])(SELECT|UPDATE|DELETE|INSERT|CREATE|ALTER|DROP|WITH)\b/i.exec(text)
  return (m?.[1] ?? '').toUpperCase()
}

function regexRule(opts: RegexRuleOptions): SqlReviewRuleDef {
  return {
    id: opts.id,
    category: opts.category,
    severity: opts.severity,
    title: opts.title,
    match: (ctx: RuleContext) => {
      if (opts.dialects && !opts.dialects.includes(ctx.dialect)) return []
      const text = stripSqlComments(ctx.sql)
      const hits: SqlReviewRuleHit[] = []
      const re = new RegExp(opts.pattern.source, opts.pattern.flags.includes('g') ? opts.pattern.flags : opts.pattern.flags + 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const quote = opts.quoteFrom ? opts.quoteFrom(m) : m[0]
        const line = lineOf(ctx.lines, (l) => l.includes(quote.slice(0, Math.min(24, quote.length))))
        hits.push({
          location: `line ${line}`,
          originalText: quote.length > 120 ? quote.slice(0, 117) + '...' : quote,
          explanation: opts.explanation,
          suggestion: opts.suggestion
        })
        if (m.index === re.lastIndex) re.lastIndex++
        if (hits.length >= 5) break
      }
      return hits
    }
  }
}

const RULES: SqlReviewRuleDef[] = [
  regexRule({
    id: 'select-star',
    category: 'spec',
    severity: 'medium',
    title: { zh: 'SELECT * 未显式列名', en: 'SELECT * without explicit columns' },
    pattern: /select\s+\*\s+from\s+[\w."]+/i,
    explanation:
      'SELECT * 拉取全部列：无法利用覆盖索引、网络传输放大，且表结构变更时结果隐式变化。',
    suggestion: '显式列出需要的列；高频查询配合覆盖索引。'
  }),
  regexRule({
    id: 'update-delete-no-where',
    category: 'correctness',
    severity: 'high',
    title: { zh: 'UPDATE/DELETE 缺少 WHERE', en: 'UPDATE/DELETE without WHERE' },
    pattern: /\bupdate\s+[^;\s]+\s+set\s+(?![^;]*\bwhere\b)[^;]*;|\bdelete\s+from\s+[^;\s]+\s*(?![^;]*\bwhere\b)[^;]*;/i,
    explanation: '无 WHERE 条件的全表 UPDATE/DELETE 会修改/删除全部行，属于高危操作。',
    suggestion: '补齐 WHERE 条件；上生产前先以 SELECT 校验影响行数。',
    quoteFrom: (m) => m[0].split(/\s(?:set|from)\s/i)[0] + ' ...'
  }),
  regexRule({
    id: 'leading-wildcard-like',
    category: 'scan',
    severity: 'medium',
    title: { zh: 'LIKE 前导通配符', en: 'LIKE with leading wildcard' },
    pattern: /like\s+'%[^']*'/i,
    explanation: "前导 % 使 B+Tree 索引失效，必然全表/全索引扫描。",
    suggestion: "改为后缀匹配 'xxx%'，或使用全文索引/搜索引擎。"
  }),
  regexRule({
    id: 'function-wrapped-column',
    category: 'index',
    severity: 'medium',
    title: { zh: 'WHERE 列上包裹函数', en: 'Function-wrapped column in WHERE' },
    pattern: /where\s+[^;]*?\b\w+\s*\(\s*\w+\s*\)\s*=|where\s+[^;]*?\b\w+\s*\(\s*\w+\s*\)\s*(>=|<=|>|<)/i,
    explanation: '对列使用函数（如 DATE(create_time)=…）使该列索引无法使用（非表达式索引场景）。',
    suggestion: '改写为范围条件（create_time >= ? and < ?），或建立表达式索引。',
    quoteFrom: (m) => m[0].trim()
  }),
  regexRule({
    id: 'order-by-no-limit',
    category: 'perf',
    severity: 'low',
    title: { zh: 'ORDER BY 无 LIMIT', en: 'ORDER BY without LIMIT' },
    pattern: /order\s+by(?![^;]*limit)[^;]*;/i,
    explanation: '大结果集排序无 LIMIT：内存排序溢出风险且传输量大。',
    suggestion: '加分页 LIMIT；确认排序键有索引支撑。'
  }),
  regexRule({
    id: 'implicit-cast-risk',
    category: 'correctness',
    severity: 'medium',
    title: { zh: '疑似隐式类型转换', en: 'Possible implicit type cast' },
    pattern: /where\s+[^;]*?'[^']*'\s*=\s*\w+_?id\b|where\s+[^;]*?\b\w+_?id\s*=\s*'/i,
    explanation: '字符串与 id 数值列直接比较可能触发隐式转换，导致索引失效或语义错误。',
    suggestion: '按列类型传参（数值列用数值），应用侧做类型校验。'
  }),
  regexRule({
    id: 'sql-concat-injection',
    category: 'injection',
    severity: 'high',
    title: { zh: 'SQL 拼接痕迹', en: 'String concatenation in SQL' },
    pattern: /\+\s*'|'\s*\+|\|\|\s*'|\$\{|%s|%d/i,
    explanation: '文本中出现拼接/占位符痕迹：存在 SQL 注入风险的写法。',
    suggestion: '使用参数化查询（prepared statement），禁止拼接用户输入。',
    dialects: undefined
  }),
  regexRule({
    id: 'join-without-on',
    category: 'correctness',
    severity: 'high',
    title: { zh: 'JOIN 缺少 ON 条件', en: 'JOIN without ON condition' },
    pattern: /\bjoin\s+\w+(\s+\w+)?\s*(where|;|group|order|left|right|inner|join)/i,
    explanation: 'JOIN 未显式 ON 条件（或依赖 WHERE 隐式连接）：易产生笛卡尔积。',
    suggestion: '显式书写 ON 条件；多表关联逐一核对关联键。',
    quoteFrom: (m) => m[0].trim()
  })
]

@Injectable()
export class SqlReviewRulesService {
  /** Run all deterministic rules. Findings always quote evidence from the SQL text. */
  analyze(sqlText: string, dialect: SqlReviewDialect, ddlContext?: string): SqlReviewFindingPayload[] {
    const ctx: RuleContext = {
      sql: sqlText,
      lines: sqlText.split('\n'),
      dialect,
      ddlContext
    }
    const findings: SqlReviewFindingPayload[] = []
    for (const rule of RULES) {
      let hits: SqlReviewRuleHit[] = []
      try {
        hits = rule.match(ctx)
      } catch {
        // A broken rule must never break the review pipeline.
        continue
      }
      for (const hit of hits) {
        findings.push({
          source: 'rule',
          ruleId: rule.id,
          category: rule.category,
          severity: rule.severity,
          location: hit.location,
          originalText: hit.originalText,
          explanation: `${rule.title.zh}：${hit.explanation}`,
          suggestion: hit.suggestion
        })
      }
    }
    findings.sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 }
      return rank[a.severity] - rank[b.severity]
    })
    return findings
  }

  listRuleIds(): string[] {
    return RULES.map((r) => r.id)
  }
}
