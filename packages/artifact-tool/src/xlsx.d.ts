export type Scalar = string | number | boolean | null
export interface SpreadsheetCell {
  value: Scalar; formula?: string; formulaType?: string; error?: string;
  style: { bl?: number; it?: number; fs?: number; ff?: string; cl?: { rgb: string }; bg?: { rgb: string }; n?: { pattern: string } }
}
export interface XlsxModel {
  sheets: { name: string; path: string; hidden: string; cells: Record<string, SpreadsheetCell>; freeze: { rows: number; columns: number }; merges: string[] }[];
  charts: string[]; tables: string[]; definedNames: { name: string; formula: string }[]; unsupported: string[]
}
export interface CellEdit { sheet: string; cell: string; value: Scalar | { formula: string }; formula?: string; error?: string }
export function readXlsx(input: Uint8Array | ArrayBuffer): Promise<XlsxModel>
export function patchXlsx(input: Uint8Array | ArrayBuffer, edits: CellEdit[], results?: CellEdit[]): Promise<Uint8Array>
export function position(address: string): { row: number; column: number }
export function cellAddress(row: number, column: number): string
