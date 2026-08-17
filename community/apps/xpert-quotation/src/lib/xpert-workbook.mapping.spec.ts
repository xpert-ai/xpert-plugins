import { parseWorkbookRecognitionInput, workbookRecognitionSchema } from './xpert-workbook.mapping.js'

describe('workbookRecognitionSchema', () => {
  it('accepts a bounded dynamic sheet mapping', () => {
    const input = validInput()
    expect(input).not.toHaveProperty('priceBookId')
    expect(workbookRecognitionSchema.safeParse(input).success).toBe(true)
  })

  it('rejects the removed priceBookId input', () => {
    const input = { ...validInput(), priceBookId: 'a21e8234-ecaa-4606-b848-fd8a068e9b7a' }
    expect(workbookRecognitionSchema.safeParse(input).success).toBe(false)
  })

  it('rejects unknown keys and target columns that overlap source columns', () => {
    const unknown = { ...validInput(), unsafeWriteAddress: 'Z999' }
    expect(workbookRecognitionSchema.safeParse(unknown).success).toBe(false)

    const overlap = validInput()
    overlap.sheetMappings[0].columns.unitPrice = 'C'
    expect(workbookRecognitionSchema.safeParse(overlap).success).toBe(false)
  })

  it('rejects duplicate worksheet and discipline-kind mappings', () => {
    const input = validInput()
    input.sheetMappings.push({ ...input.sheetMappings[0] })
    expect(workbookRecognitionSchema.safeParse(input).success).toBe(false)
  })

  it('normalizes a measure sheet that maps amount to its only price column', () => {
    const input = validInput()
    input.sheetMappings = [{
      sheetName: '措施项目清单', discipline: 'building', kind: 'measure',
      headerRow: 4, dataStartRow: 5, dataEndRow: 65,
      columns: { code: 'B', name: 'C', specification: ['D'], unitPrice: 'G', amount: 'G' },
      confidence: 0.9, rationale: '措施表只有一个价格列。', evidence: ['G4=价格(元)']
    }]

    expect(workbookRecognitionSchema.safeParse(input).success).toBe(true)
    expect(parseWorkbookRecognitionInput(input).sheetMappings[0].columns.amount).toBeUndefined()
  })

  it('still rejects bill sheets that reuse unitPrice as amount', () => {
    const input = validInput()
    input.sheetMappings[0].columns.amount = input.sheetMappings[0].columns.unitPrice

    expect(workbookRecognitionSchema.safeParse(input).success).toBe(false)
  })

  it('accepts a subtotal whose source stays in data rows and ends before its target', () => {
    const input = validInput()
    const result = workbookRecognitionSchema.safeParse({
      ...input,
      sheetMappings: [{
        ...input.sheetMappings[0],
        totals: { subtotals: [{ startRow: 7, endRow: 79, targetRow: 80 }] }
      }]
    })

    expect(result.success).toBe(true)
  })

  it('rejects subtotal ranges outside data rows and target rows inside their own SUM range', () => {
    const input = validInput()
    const result = workbookRecognitionSchema.safeParse({
      ...input,
      sheetMappings: [{
        ...input.sheetMappings[0],
        totals: { subtotals: [{ startRow: 6, endRow: 80, targetRow: 80 }] }
      }]
    })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['sheetMappings', 0, 'totals', 'subtotals', 0] }),
      expect.objectContaining({
        path: ['sheetMappings', 0, 'totals', 'subtotals', 0, 'targetRow'],
        message: expect.stringContaining('endRow = targetRow - 1')
      })
    ]))
  })
})

function validInput() {
  return {
    quotationId: '2c71b771-a6a1-42a2-9025-55069229d2b1',
    sheetMappings: [{
      sheetName: '自定义报价表', discipline: 'building' as const, kind: 'bill' as const,
      headerRow: 4, dataStartRow: 7, dataEndRow: 80,
      columns: { code: 'B', name: 'C', specification: ['D', 'E'], unit: 'G', quantity: 'H', unitPrice: 'I', amount: 'J' },
      confidence: 0.93, rationale: '根据表头语义识别。', evidence: ['B4=项目编码', 'C4=项目名称']
    }],
    recognitionConfidence: 0.91,
    recognitionRationale: '工作表标题和表头语义一致。',
    changeSummary: '识别动态报价工作表。'
  }
}
