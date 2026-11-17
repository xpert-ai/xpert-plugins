import * as React from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from '@xpert-ai/plugin-shadcn-ui'
import type { AnalyticalDataset } from '@xpert-ai/contracts'
import type { messages } from './i18n'

export function DatasetPreview({ result, t }: { result: AnalyticalDataset; t: ReturnType<typeof messages> }) {
  return <section className="min-w-0 space-y-3" aria-label={t.libPreview}>
    <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">{result.completeness.returnedRows} {t.libRows}</Badge>
      <Badge variant="outline">{result.completeness.scope === 'full_query_result' && !result.completeness.truncated ? t.libComplete : t.libPartial}</Badge>
      <span className="text-xs text-muted-foreground">{t.libFetchedAt} {result.freshness.sourceFetchedAt}</span></div>
    <div className="max-h-80 overflow-auto border"><Table><TableHeader><TableRow>{result.fields.map(field => <TableHead key={field.id}>{field.label}</TableHead>)}</TableRow></TableHeader>
      <TableBody>{result.rows.slice(0, 100).map((row, index) => <TableRow key={index}>{result.fields.map(field => <TableCell key={field.id} className="max-w-64 break-words">{row[field.id] === null ? '—' : String(row[field.id])}</TableCell>)}</TableRow>)}</TableBody></Table></div>
    {!result.rows.length && <p className="text-sm text-muted-foreground">{t.libEmptyResult}</p>}
    {result.rows.length > 100 && <p className="text-xs text-muted-foreground">{t.libFirst100}</p>}
    <details className="text-xs text-muted-foreground"><summary>{t.libQueryEvidence}</summary><p className="break-all py-2">{result.provenance.executionId}</p></details>
  </section>
}
