/** XLSX edit semantics are private to the Office plugin. */
export interface SpreadsheetCell { row: number; column: number; value: string | number | boolean | null; formula?: string }
export interface SpreadsheetDocument {
  type: 'grid'
  sheets: Array<{ id: string; title: string; rows: number; columns: number; cells: SpreadsheetCell[] }>
}
export interface SpreadsheetPatch { sheetId: string; cells: SpreadsheetCell[] }
