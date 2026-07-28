# OfficeCLI command workflows

## Word

Load the professional workflow first:

```json
{"name":"word"}
```

```json
{"command":"view","args":["outline"]}
```

```json
{"command":"query","args":["paragraph[style=Heading1]"]}
```

```json
{"command":"set","args":["/body/p[@paraId=1A2B3C4D]","--prop","find=draft","--prop","replace=final"]}
```

After content and heading assignments are complete, create actual style
definitions and optionally a native TOC:

```json
{
  "documentId": "exact-id",
  "expectedVersionNumber": 4,
  "includeTableOfContents": true,
  "changeSummary": "Apply professional Word hierarchy and TOC"
}
```

Verify with `validate`, `view issues`, and the Workbench preview. A successful
export must show visible differences between title, headings, and body text.

## Excel

Load `excel`, `financial-model`, or `data-dashboard` before a substantial build.
Use formulas rather than pasted calculated values, set widths and number formats
explicitly, freeze or emphasize headers where appropriate, and visually inspect
charts and conditional formatting.

Read a bounded region:

```json
{"command":"view","args":["text","--cols","A,B,C","--max-lines","50"]}
```

Set a cell:

```json
{"command":"set","args":["/Sheet1/B2","--prop","value=1250","--prop","numberFormat=$#,##0"]}
```

For multiple edits, use `batch` with JSON through `stdin` so the document opens and saves once.

Import CSV without exposing host file paths:

```json
{"command":"import","args":["/Sheet1","--stdin","--format","csv","--header"],"stdin":"Name,Score\nAda,98\nLin,95"}
```

## PowerPoint

Load `pptx`, `pitch-deck`, `morph-ppt`, or `morph-ppt-3d` before a substantial
deck build. Establish a theme and type scale before adding content; use deliberate
layouts and visuals rather than dense text-only slides; inspect every slide for
clipping and overflow.

Inspect slides and shapes:

```json
{"command":"get","args":["/slide[1]","--depth","1"]}
```

Edit a stable shape:

```json
{"command":"set","args":["/slide[1]/shape[@id=42]","--prop","text=Quarterly results","--prop","size=28pt"]}
```

Render and inspect issues after layout changes.

## Template merge

Use `merge --data` with inline JSON text. The plugin rejects JSON file paths and manages the template and output Office file paths.

## Batch

Pass the batch array in the tool's `stdin` field:

```json
[
  {"command":"set","path":"/Sheet1/A1","props":{"value":"Name","bold":"true"}},
  {"command":"set","path":"/Sheet1/B1","props":{"value":"Score","bold":"true"}}
]
```

## Help

Use `officecli_help` with progressively specific arguments:

```json
{"args":["docx"]}
```

```json
{"args":["pptx","shape"]}
```

```json
{"args":["xlsx","set","cell"]}
```
