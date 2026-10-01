import type { DatabaseEngine, DatabaseObjectDetail } from '@xpert-ai/plugin-sdk/data-workbench'
export interface Snapshot {
  engine: DatabaseEngine
  capturedAt: string
  objects: DatabaseObjectDetail[]
}
export function compareSnapshots(before: Snapshot, after: Snapshot) {
  const lines: string[] = [],
    sql: string[] = [],
    same = before.engine === after.engine
  const quote = (name: string) => {
    const q = after.engine === 'postgres' ? '"' : '`'
    return q + name.split(q).join(q + q)
  }
  for (const current of after.objects) {
    const prior = before.objects.find(
      (item) =>
        item.object.name === current.object.name &&
        item.object.schema === current.object.schema &&
        item.object.database === current.object.database
    )
    if (!prior) {
      lines.push(`+ ${current.object.name}`)
      if (same) sql.push(current.definition.replace(/;?$/, ';'))
      continue
    }
    const namespace = current.object.schema ?? current.object.database,
      ref = [namespace, current.object.name]
        .filter(Boolean)
        .map((name) => quote(name!))
        .join('.')
    for (const column of current.columns) {
      const old = prior.columns.find((item) => item.name === column.name)
      if (!old) {
        lines.push(`+ ${current.object.name}.${column.name} ${column.dataType}`)
        if (same)
          sql.push(
            `ALTER TABLE ${ref} ADD COLUMN ${quote(column.name)} ${column.dataType}${
              column.nullable ? '' : ' NOT NULL'
            };`
          )
      } else if (old.dataType !== column.dataType || old.nullable !== column.nullable) {
        lines.push(`~ ${current.object.name}.${column.name}: ${old.dataType} → ${column.dataType}`)
        if (same)
          sql.push(
            `-- Review type/nullability change for ${ref}.${quote(
              column.name
            )} before generating engine-specific ALTER SQL.`
          )
      }
    }
    for (const column of prior.columns)
      if (!current.columns.some((item) => item.name === column.name)) {
        lines.push(`- ${current.object.name}.${column.name}`)
        if (same) sql.push(`-- Destructive: ALTER TABLE ${ref} DROP COLUMN ${quote(column.name)};`)
      }
    if (prior.definition !== current.definition && !lines.some((line) => line.includes(current.object.name)))
      lines.push(`~ ${current.object.name}: definition changed`)
  }
  for (const prior of before.objects)
    if (!after.objects.some((item) => item.object.name === prior.object.name)) lines.push(`- ${prior.object.name}`)
  return {
    report: lines.join('\n') || 'No structural differences',
    sql: same ? sql.join('\n\n') : '-- Cross-engine comparison: migration SQL is unavailable.',
    sameEngine: same,
  }
}
export function documentation(object: DatabaseObjectDetail) {
  return `# ${object.object.name}\n\n${
    object.model ? `Model: ${object.model}\n\n` : ''
  }| Column | Type | Nullable |\n|---|---|---|\n${object.columns
    .map((c) => `| ${c.name} | ${c.dataType} | ${c.nullable ? 'YES' : 'NO'} |`)
    .join('\n')}\n\n## Definition\n\n\`\`\`sql\n${object.definition}\n\`\`\`\n`
}
