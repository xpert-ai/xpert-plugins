# Authoring contract (version 1)

```json
{
  "version": 1,
  "sheets": [
    {
      "name": "Sales",
      "rows": [
        ["Month", "Revenue", "Cost", "Profit"],
        ["Q1", 120, 80, {"formula": "=B2-C2"}],
        ["Q2", 180, 100, {"formula": "=B3-C3"}],
        ["Q3", 240, 130, {"formula": "=B4-C4"}]
      ],
      "columnWidths": [20, 18, 18, 18],
      "header": true,
      "freezeRows": 1,
      "numberFormats": [{"range": "B2:D4", "format": "#,##0.00"}],
      "tables": [{"name": "SalesTable", "range": "A1:D4"}],
      "charts": [{"type": "bar", "title": "Revenue", "anchor": "A7", "series": [
        {"name": "Revenue", "categories": "A2:A4", "values": "B2:B4"}
      ]}]
    },
    {"name": "Summary", "rows": [["Metric", "Value"],
      ["Revenue", {"formula": "=SUM(Sales!B2:B4)"}],
      ["Profit", {"formula": "=SUM(Sales!D2:D4)"}],
      ["Margin", {"formula": "=IFERROR(B3/B2,0)"}]],
      "numberFormats": [{"range": "B4:B4", "format": "0.00%"}]
    }
  ]
}
```

All objects are strict; do not invent fields. Workbook: `version`, `sheets`.
Sheet: `name`, `rows`, optional `columnWidths`, `header` (default true),
`freezeRows` (default 1), `hidden` (default false), `numberFormats`, `tables`,
`charts`. A value is string, finite number, boolean, null, or `{formula}`.
Use actual user data; label examples or assumptions. Widths are Excel character
units, 4..80. Names: 1..31 characters, no Excel-invalid punctuation. At least one
sheet must be visible. Charts: `bar`, `line`, `pie`; categories and values are
bounded ranges on the containing sheet; names are literal series labels.
Charts occupy about 600x320 pixels, so place them below/right of the data with
enough whitespace. Authoring uses landscape pages fitted to one page per sheet;
keep sheets small enough for readable output and verify the render.

Supported formulas: arithmetic/comparison, A1 references, bounded ranges,
cross-sheet references (quote names with spaces), SUM, AVERAGE, MIN, MAX, COUNT,
COUNTA, IF, IFERROR, ROUND, ROUNDUP, ROUNDDOWN, SUMIF, SUMIFS, COUNTIF, COUNTIFS,
ABS, AND, OR, NOT. No volatile/network/custom/array/structured/external formulas.
Limits: 20 sheets, 100000 cells total, 10000 rows and 256 columns for calculation,
20 MiB input XLSX, 80 preview pages. Never fill huge unused ranges.
