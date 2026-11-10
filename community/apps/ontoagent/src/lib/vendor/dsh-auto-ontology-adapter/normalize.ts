import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { canonicalJson, type Assertion, type Node } from '../dsh-ontology-core/index.js'
import type { AutoSnapshotInput, AutoTermCertification, NormalizedAutoSnapshot } from './types.js'

interface Column { id: string; name?: string; description?: string; type?: string }
interface Table { id: string; name?: string; description?: string; columns?: Column[] }
interface Schema { id: string; name?: string; database_name?: string; tables?: Table[] }
interface Database { id: string; name?: string; schemas?: Schema[] }
interface ColumnAttribute { id: string; name?: string; description?: string; column_id?: string }
interface Term { id: string; name?: string; description?: string; represents?: string[]; columns_attributes?: ColumnAttribute[] }
interface SqlAttribute { id: string; name?: string; description?: string; sql?: string; sql_column_is?: string[]; term_id?: string }
interface SemanticFk { column_attribute_id: string; column_id: string; use_in_join_paths?: boolean }
interface NativeDocument {
  data_layer?: {
    databases?: Database[]
    foreign_keys?: Array<{ source_column_id: string; target_column_id: string }>
  }
  semantic_layer?: {
    terms?: Term[]
    semantic_fks?: SemanticFk[]
    sql_attributes?: Record<string, SqlAttribute[] | undefined>
    custom_analyses?: unknown[]
  }
  zones?: unknown[]
}

const sha = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex')
const certified = (entry: AutoTermCertification | undefined): boolean =>
  entry?.certification === 'certified' || (entry?.certified === true && entry.certification === undefined)

export function normalizeAutoSnapshot(input: AutoSnapshotInput): NormalizedAutoSnapshot {
  const document = parse(input.yaml) as NativeDocument
  if (document === null || typeof document !== 'object' || Array.isArray(document)) throw new Error('auto_snapshot_not_object')
  const source = input.source ?? 'default'
  const adapterVersion = input.adapterVersion ?? 'auto-native-v1'
  const scope = 'gov:auto:' + source
  const certification = new Map(input.terms.map((entry) => [entry.id, entry]))
  const terms = document.semantic_layer?.terms ?? []
  const missingCertification = terms.filter((term) => !certification.has(term.id)).map((term) => term.id)
  if (missingCertification.length > 0) throw new Error('auto_certification_missing:' + missingCertification.sort().join(','))
  const accepted = terms.filter((term) => certified(certification.get(term.id)))
  const excluded = terms.filter((term) => !certified(certification.get(term.id))).map((term) => ({
    id: term.id,
    name: term.name ?? '',
    certification: certification.get(term.id)?.certification ?? 'missing',
  })).sort((a, b) => a.id.localeCompare(b.id))
  if (accepted.length > 0 && input.terms.length === 0) throw new Error('auto_certification_missing')

  const databases = document.data_layer?.databases ?? []
  const tables = databases.flatMap((db) => (db.schemas ?? []).flatMap((schema) =>
    (schema.tables ?? []).map((table) => ({ table, schema, database: db }))))
  const tableById = new Map(tables.map((entry) => [entry.table.id, entry]))
  const columnById = new Map(tables.flatMap((entry) => (entry.table.columns ?? []).map((column) => [column.id, { column, ...entry }])))
  const termIds = new Set(accepted.map((term) => term.id))
  const attributes = accepted.flatMap((term) => term.columns_attributes ?? [])
  const attributeIds = new Set(attributes.map((attribute) => attribute.id))
  const tableIds = new Set(accepted.flatMap((term) => term.represents ?? []))
  for (const attribute of attributes) {
    const owner = columnById.get(attribute.column_id ?? '')
    if (owner !== undefined) tableIds.add(owner.table.id)
  }
  const semanticFks = (document.semantic_layer?.semantic_fks ?? []).filter((fk) => {
    if (!attributeIds.has(fk.column_attribute_id)) return false
    const sourceColumn = columnById.get(fk.column_id)
    return sourceColumn !== undefined && tableIds.has(sourceColumn.table.id)
  })
  const columnIds = new Set(attributes.map((attribute) => attribute.column_id ?? '').filter(Boolean))
  for (const fk of semanticFks) columnIds.add(fk.column_id)
  const sqlAttributes = Object.values(document.semantic_layer?.sql_attributes ?? {})
    .flatMap((items) => items ?? []).filter((attribute) => termIds.has(attribute.term_id ?? ''))
  for (const attribute of sqlAttributes) {
    for (const columnId of attribute.sql_column_is ?? []) {
      if (!columnById.has(columnId)) throw new Error('auto_dangling_sql_column:' + attribute.id + ':' + columnId)
      columnIds.add(columnId)
    }
  }

  for (const term of accepted) {
    for (const tableId of term.represents ?? []) if (!tableById.has(tableId)) throw new Error('auto_dangling_table:' + term.id + ':' + tableId)
    for (const attribute of term.columns_attributes ?? []) {
      if (!columnById.has(attribute.column_id ?? '')) throw new Error('auto_dangling_column:' + attribute.id)
    }
  }

  const nodes: Node[] = []
  const node = (id: string, kind: Node['kind'], labels: string[], definition?: string): void => {
    nodes.push({ id, kind, labels: [...new Set(labels.filter(Boolean))].sort(), aliases: labels.slice(1), scope, status: 'accepted', ...(definition ? { definition } : {}) })
  }
  for (const term of accepted) {
    const entry = certification.get(term.id)
    node('auto:term:' + term.id, 'term', [term.name ?? term.id, ...(entry?.synonyms ?? [])], term.description)
  }
  for (const attribute of attributes) node('auto:attribute:' + attribute.id, 'property', [attribute.name ?? attribute.id], attribute.description)
  for (const attribute of sqlAttributes) node('auto:sql:' + attribute.id, 'property', [attribute.name ?? attribute.id], attribute.description)
  for (const columnId of [...columnIds].sort()) {
    const found = columnById.get(columnId)
    if (found === undefined) throw new Error('auto_dangling_column:' + columnId)
    node('auto:column:' + columnId, 'property', [found.column.name ?? columnId], found.column.description)
  }
  for (const tableId of [...tableIds].sort()) {
    const found = tableById.get(tableId)
    if (found === undefined) throw new Error('auto_dangling_table:' + tableId)
    node('auto:table:' + tableId, 'class', [found.table.name ?? tableId], found.table.description)
  }

  const assertions: Assertion[] = []
  const add = (s: string, p: string, o: unknown, q: Record<string, string> = {}): void => {
    const id = 'auto:' + sha([s, p, o]).slice(0, 32)
    assertions.push({
      id, s, p, o, q: { source, ...q }, scope, status: 'accepted',
      authority: { rank: 100, confidence: 1 },
      evidence: [{ kind: 'external_ref', locator: 'auto:' + s + '#' + p, digest: sha([s, p, o]) }],
    })
  }
  for (const term of accepted) {
    const sid = 'auto:term:' + term.id
    add(sid, 'label', term.name ?? term.id)
    add(sid, 'certification', 'certified')
    if (term.description) add(sid, 'definition', term.description)
    for (const synonym of certification.get(term.id)?.synonyms ?? []) add(sid, 'alias', synonym)
    for (const tableId of term.represents ?? []) add(sid, 'represents_table', 'auto:table:' + tableId)
    for (const attribute of term.columns_attributes ?? []) add(sid, 'has_attribute', 'auto:attribute:' + attribute.id)
  }
  for (const attribute of attributes) {
    const sid = 'auto:attribute:' + attribute.id
    add(sid, 'label', attribute.name ?? attribute.id)
    if (attribute.description) add(sid, 'definition', attribute.description)
    add(sid, 'maps_to_column', 'auto:column:' + String(attribute.column_id))
  }
  for (const attribute of sqlAttributes) {
    const sid = 'auto:sql:' + attribute.id
    add(sid, 'label', attribute.name ?? attribute.id)
    if (attribute.description) add(sid, 'definition', attribute.description)
    if (attribute.sql) add(sid, 'sql_expression', attribute.sql)
    for (const columnId of attribute.sql_column_is ?? []) add(sid, 'uses_column', 'auto:column:' + columnId)
    add('auto:term:' + String(attribute.term_id), 'has_sql_attribute', sid)
  }
  for (const columnId of [...columnIds].sort()) {
    const found = columnById.get(columnId)!
    const sid = 'auto:column:' + columnId
    add(sid, 'physical_name', [found.database.name, found.schema.name, found.table.name, found.column.name].filter(Boolean).join('.'))
    if (found.column.type) add(sid, 'data_type', found.column.type)
    add(sid, 'belongs_to_table', 'auto:table:' + found.table.id)
  }
  for (const tableId of [...tableIds].sort()) {
    const found = tableById.get(tableId)!
    const sid = 'auto:table:' + tableId
    add(sid, 'label', found.table.name ?? tableId)
    if (found.table.description) add(sid, 'definition', found.table.description)
  }
  for (const fk of semanticFks) {
    if (fk.use_in_join_paths === false) continue
    add('auto:column:' + fk.column_id, 'references_attribute', 'auto:attribute:' + fk.column_attribute_id)
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id))
  assertions.sort((a, b) => a.id.localeCompare(b.id))
  const sourceDigest = 'sha256:' + sha({ adapterVersion, source, nodes, assertions, excluded })
  const unsupported = [
    ...((document.semantic_layer?.custom_analyses?.length ?? 0) > 0 ? ['custom_analyses'] : []),
    ...((document.zones?.length ?? 0) > 0 ? ['zones_not_mapped_to_visible_scopes'] : []),
  ]
  return { source, adapterVersion, sourceDigest, nodes, assertions, excluded, unsupported }
}
