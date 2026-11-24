import { createHash } from 'node:crypto'
import type { JSONValue } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,90}$/)
const schema = z
  .object({
    format: z.literal('data-xpert.sql-model/v1'),
    key: identifier,
    version: z.string().min(1).max(48),
    name: z.string().min(1).max(160),
    catalog: identifier,
    schema: z.string().max(256000),
    views: z.string().max(256000)
  })
  .strict()
const fact = z.object({ type: z.literal('table'), table: z.object({ name: identifier, schema: identifier }) })
const draft = z.object({ cubes: z.array(z.object({ name: identifier, fact }).passthrough()).min(1) }).passthrough()

export function digest(value: unknown): string {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_, v: unknown) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
          : v
      )
    )
    .digest('hex')
}

export function materializeBundle(raw: JSONValue, mode: string) {
  const bundle = schema.parse(raw)
  const model = draft.parse(JSON.parse(bundle.schema))
  if (mode === 'existing-tables') return { bundle, draft: model, catalog: bundle.catalog }
  if (mode !== 'demo-views') throw Error('DATAX_BOOTSTRAP_MODE_INVALID')
  const views = z.record(z.string().max(60000)).parse(JSON.parse(bundle.views))
  const cubes = model.cubes.map((cube) => {
    const alias = cube.fact.table.name
    const sql = views[alias]
    if (
      !sql ||
      !/^SELECT\s/i.test(sql) ||
      /;|--|\/\*|\b(?:insert|alter|update|drop|delete|create|into|call)\b/i.test(sql)
    )
      throw Error('DATAX_BOOTSTRAP_VIEW_INVALID')
    return {
      ...cube,
      fact: { type: 'view', view: { alias, sql: { content: sql }, SQL: [{ dialect: 'generic', _: sql }] } }
    }
  })
  return { bundle, draft: { ...model, cubes }, catalog: undefined }
}
