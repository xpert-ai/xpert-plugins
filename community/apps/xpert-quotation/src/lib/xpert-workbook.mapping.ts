import { z } from 'zod/v3'
import type { XpertSheetMapping, WorkbookRecognitionInput } from './types.js'

const excelColumnSchema = z.string().trim().toUpperCase().regex(
  /^[A-Z]{1,3}$/,
  'Excel columns must use A1 column letters such as B, I, or AA.'
)

const subtotalSchema = z.object({
  startRow: z.number().int().min(1).max(10_000),
  endRow: z.number().int().min(1).max(10_000),
  targetRow: z.number().int().min(1).max(10_000)
}).strict().refine((value) => value.endRow >= value.startRow, {
  path: ['endRow'],
  message: 'Subtotal endRow must be greater than or equal to startRow.'
})

export const xpertSheetMappingSchema = z.object({
  sheetName: z.string().trim().min(1).max(31).describe('Exact worksheet name returned by xpert_quotation_inspect_workbook.'),
  discipline: z.enum(['building', 'installation']),
  kind: z.enum(['bill', 'material', 'measure']),
  headerRow: z.number().int().min(1).max(10_000),
  dataStartRow: z.number().int().min(1).max(10_000),
  dataEndRow: z.number().int().min(1).max(10_000),
  columns: z.object({
    code: excelColumnSchema.optional(),
    name: excelColumnSchema,
    specification: z.array(excelColumnSchema).max(6).optional(),
    unit: excelColumnSchema.optional(),
    quantity: excelColumnSchema.optional(),
    unitPrice: excelColumnSchema.describe('Blank unit-price target column. It must be distinct from every source column and from amount.'),
    amount: excelColumnSchema.describe(
      'Required distinct blank amount target column for bill and material sheets. Omit it only for a measure sheet that exposes one price column; if it equals unitPrice for a measure sheet, the server normalizes it to omitted.'
    ).optional()
  }).strict(),
  totals: z.object({
    subtotals: z.array(subtotalSchema).max(30).optional(),
    finalTotalRow: z.number().int().min(1).max(10_000).optional()
  }).strict().optional(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(600),
  evidence: z.array(z.string().trim().min(1).max(180)).min(1).max(12)
}).strict().superRefine((mapping, context) => {
  if (mapping.dataStartRow <= mapping.headerRow) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataStartRow'], message: 'dataStartRow must be after headerRow.' })
  }
  if (mapping.dataEndRow < mapping.dataStartRow) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dataEndRow'], message: 'dataEndRow must be at or after dataStartRow.' })
  }
  if ((mapping.kind === 'bill' || mapping.kind === 'material') && !mapping.columns.quantity) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columns', 'quantity'], message: 'Bill and material mappings require a quantity column.' })
  }
  if ((mapping.kind === 'bill' || mapping.kind === 'material') && !mapping.columns.amount) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['columns', 'amount'],
      message: `A ${mapping.kind} mapping requires the distinct blank amount/合价 target column. Omit amount only when kind is measure and the sheet has one price column.`
    })
  }
  const sourceColumns = [
    mapping.columns.code,
    mapping.columns.name,
    ...(mapping.columns.specification ?? []),
    mapping.columns.unit,
    mapping.columns.quantity
  ].filter((column): column is string => Boolean(column))
  if (sourceColumns.includes(mapping.columns.unitPrice)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columns', 'unitPrice'], message: 'unitPrice must be a blank target column, not a source column.' })
  }
  const measureUsesSinglePriceColumn = mapping.kind === 'measure' && mapping.columns.amount === mapping.columns.unitPrice
  if (mapping.columns.amount && !measureUsesSinglePriceColumn && (sourceColumns.includes(mapping.columns.amount) || mapping.columns.amount === mapping.columns.unitPrice)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['columns', 'amount'], message: 'amount must be a distinct blank target column.' })
  }
  const subtotals = mapping.totals?.subtotals ?? []
  const targetRows = new Set<number>()
  subtotals.forEach((subtotal, index) => {
    if (subtotal.startRow < mapping.dataStartRow || subtotal.endRow > mapping.dataEndRow) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals', 'subtotals', index],
        message: `Subtotal source rows must stay within dataStartRow ${mapping.dataStartRow} and dataEndRow ${mapping.dataEndRow}.`
      })
    }
    if (subtotal.targetRow >= subtotal.startRow && subtotal.targetRow <= subtotal.endRow) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals', 'subtotals', index, 'targetRow'],
        message: 'Subtotal targetRow must be outside its own startRow..endRow SUM range; for a trailing subtotal, use endRow = targetRow - 1.'
      })
    }
    if (targetRows.has(subtotal.targetRow)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['totals', 'subtotals', index, 'targetRow'], message: 'Subtotal targetRow values must be unique.' })
    }
    targetRows.add(subtotal.targetRow)
  })
  const sortedSubtotals = subtotals
    .map((subtotal, index) => ({ ...subtotal, index }))
    .sort((left, right) => left.startRow - right.startRow)
  sortedSubtotals.forEach((subtotal, index) => {
    if (index && subtotal.startRow <= sortedSubtotals[index - 1].endRow) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['totals', 'subtotals', subtotal.index], message: 'Subtotal source ranges must not overlap.' })
    }
  })
  if (mapping.totals?.finalTotalRow && targetRows.has(mapping.totals.finalTotalRow)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['totals', 'finalTotalRow'], message: 'finalTotalRow must not duplicate a subtotal targetRow.' })
  }
  if (mapping.totals?.finalTotalRow && !subtotals.length &&
      mapping.totals.finalTotalRow >= mapping.dataStartRow && mapping.totals.finalTotalRow <= mapping.dataEndRow) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['totals', 'finalTotalRow'],
      message: 'A direct finalTotalRow must be outside the data rows it sums; normally dataEndRow = finalTotalRow - 1.'
    })
  }
})

export const workbookRecognitionSchema = z.object({
  quotationId: z.string().uuid(),
  sheetMappings: z.array(xpertSheetMappingSchema).min(1).max(12),
  recognitionConfidence: z.number().min(0).max(1),
  recognitionRationale: z.string().trim().min(1).max(800),
  changeSummary: z.string().trim().min(1).max(240)
}).strict().superRefine((input, context) => {
  const sheetNames = new Set<string>()
  const roles = new Set<string>()
  input.sheetMappings.forEach((mapping, index) => {
    if (sheetNames.has(mapping.sheetName)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sheetMappings', index, 'sheetName'], message: 'Each worksheet may be mapped only once.' })
    }
    sheetNames.add(mapping.sheetName)
    const role = `${mapping.discipline}:${mapping.kind}`
    if (roles.has(role)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sheetMappings', index, 'kind'], message: 'Each discipline and quotation-table kind may be mapped only once.' })
    }
    roles.add(role)
  })
})

export function parseXpertSheetMappings(input: unknown): XpertSheetMapping[] {
  const parsed = xpertSheetMappingSchema.array().min(1).max(12).safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  }
  return parsed.data.map(materializeSheetMapping)
}

export function parseWorkbookRecognitionInput(input: unknown): WorkbookRecognitionInput & {
  quotationId: string
} {
  const parsed = workbookRecognitionSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  }
  return {
    quotationId: required(parsed.data.quotationId, 'quotationId'),
    sheetMappings: parseXpertSheetMappings(parsed.data.sheetMappings),
    recognitionConfidence: required(parsed.data.recognitionConfidence, 'recognitionConfidence'),
    recognitionRationale: required(parsed.data.recognitionRationale, 'recognitionRationale'),
    changeSummary: required(parsed.data.changeSummary, 'changeSummary')
  }
}

function materializeSheetMapping(mapping: z.infer<typeof xpertSheetMappingSchema>): XpertSheetMapping {
  const columns = required(mapping.columns, 'columns')
  const totals = mapping.totals
  return {
    sheetName: required(mapping.sheetName, 'sheetName'),
    discipline: required(mapping.discipline, 'discipline'),
    kind: required(mapping.kind, 'kind'),
    headerRow: required(mapping.headerRow, 'headerRow'),
    dataStartRow: required(mapping.dataStartRow, 'dataStartRow'),
    dataEndRow: required(mapping.dataEndRow, 'dataEndRow'),
    columns: {
      code: columns.code,
      name: required(columns.name, 'columns.name'),
      specification: columns.specification,
      unit: columns.unit,
      quantity: columns.quantity,
      unitPrice: required(columns.unitPrice, 'columns.unitPrice'),
      amount: mapping.kind === 'measure' && columns.amount === columns.unitPrice ? undefined : columns.amount
    },
    totals: totals ? {
      subtotals: totals.subtotals?.map((subtotal) => ({
        startRow: required(subtotal.startRow, 'totals.subtotals.startRow'),
        endRow: required(subtotal.endRow, 'totals.subtotals.endRow'),
        targetRow: required(subtotal.targetRow, 'totals.subtotals.targetRow')
      })),
      finalTotalRow: totals.finalTotalRow
    } : undefined,
    confidence: required(mapping.confidence, 'confidence'),
    rationale: required(mapping.rationale, 'rationale'),
    evidence: required(mapping.evidence, 'evidence')
  }
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) throw new Error(`${field} is required.`)
  return value
}
