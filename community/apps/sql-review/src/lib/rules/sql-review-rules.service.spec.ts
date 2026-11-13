import { SqlReviewRulesService } from './sql-review-rules.service'

describe('SqlReviewRulesService', () => {
  let service: SqlReviewRulesService

  beforeEach(() => {
    service = new SqlReviewRulesService()
  })

  it('flags SELECT * with evidence quote and sorted severity', () => {
    const findings = service.analyze('SELECT * FROM orders', 'postgresql')
    const star = findings.find((f) => f.ruleId === 'select-star')
    expect(star).toBeDefined()
    expect(star!.originalText.toLowerCase()).toContain('select * from orders')
    expect(star!.source).toBe('rule')
    expect(star!.location).toMatch(/line \d+/)
  })

  it('flags UPDATE without WHERE as high severity', () => {
    const findings = service.analyze('UPDATE orders SET status = 1;', 'mysql')
    const hit = findings.find((f) => f.ruleId === 'update-delete-no-where')
    expect(hit).toBeDefined()
    expect(hit!.severity).toBe('high')
  })

  it('flags DELETE without WHERE', () => {
    const findings = service.analyze('DELETE FROM t_orders;', 'postgresql')
    expect(findings.some((f) => f.ruleId === 'update-delete-no-where')).toBe(true)
  })

  it('does not flag UPDATE with WHERE', () => {
    const findings = service.analyze("UPDATE orders SET status = 1 WHERE id = 42;", 'postgresql')
    expect(findings.some((f) => f.ruleId === 'update-delete-no-where')).toBe(false)
  })

  it('flags leading wildcard LIKE', () => {
    const findings = service.analyze("SELECT id FROM users WHERE name LIKE '%xx%';", 'postgresql')
    expect(findings.some((f) => f.ruleId === 'leading-wildcard-like')).toBe(true)
  })

  it('does not flag suffix-only LIKE', () => {
    const findings = service.analyze("SELECT id FROM users WHERE name LIKE 'xx%';", 'postgresql')
    expect(findings.some((f) => f.ruleId === 'leading-wildcard-like')).toBe(false)
  })

  it('flags function-wrapped column in WHERE', () => {
    const findings = service.analyze(
      "SELECT id FROM orders WHERE DATE(create_time) = '2026-01-01';",
      'postgresql'
    )
    expect(findings.some((f) => f.ruleId === 'function-wrapped-column')).toBe(true)
  })

  it('flags sql concatenation / injection traces', () => {
    const findings = service.analyze("SELECT id FROM users WHERE name = 'a' + name;", 'postgresql')
    expect(findings.some((f) => f.ruleId === 'sql-concat-injection')).toBe(true)
  })

  it('flags JOIN without ON', () => {
    const findings = service.analyze(
      'SELECT a.id FROM t_a a JOIN t_b b WHERE a.id = b.aid;',
      'postgresql'
    )
    expect(findings.some((f) => f.ruleId === 'join-without-on')).toBe(true)
  })

  it('clean sql passes with zero findings', () => {
    const clean = `SELECT id, name FROM users WHERE tenant_id = 1 AND created_at >= '2026-01-01' ORDER BY id LIMIT 50;`
    const findings = service.analyze(clean, 'postgresql')
    expect(findings).toEqual([])
  })

  it('rules never crash on malformed sql and always quote evidence', () => {
    const findings = service.analyze('SELEC * FRM ???', 'postgresql')
    for (const f of findings) {
      expect(f.originalText.length).toBeGreaterThan(0)
      expect(f.explanation.length).toBeGreaterThan(0)
    }
  })

  it('sorts findings by severity high first', () => {
    const findings = service.analyze(
      "SELECT * FROM a JOIN b; DELETE FROM a;",
      'postgresql'
    )
    const sev = findings.map((f) => f.severity)
    expect(sev.indexOf('high')).toBeLessThan(sev.indexOf('medium'))
  })

  it('lists registered rule ids for diagnostics', () => {
    const ids = service.listRuleIds()
    expect(ids.length).toBeGreaterThanOrEqual(8)
    expect(ids).toContain('select-star')
  })
})
