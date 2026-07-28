---
name: officecli
description: Create, inspect, render, edit, validate, version, restore, and download native DOCX, XLSX, and PPTX files through the Xpert OfficeCLI app. Use for Office document automation, visual element editing, template merge, batch operations, formatting checks, charts, formulas, and raw OOXML fallback.
---

# OfficeCLI for Xpert

Use the OfficeCLI app tools and Workbench. Do not invoke a host shell or invent local file paths.

## Required workflow

1. Obtain an exact `documentId` from `officecli_list_documents`, a previous tool result, or the OfficeCLI Workbench.
2. For substantial creation or reformatting, call `officecli_load_skill` with the closest professional workflow:
   - Word: `word` or `academic-paper`
   - Excel: `excel`, `financial-model`, or `data-dashboard`
   - PowerPoint: `pptx`, `pitch-deck`, `morph-ppt`, or `morph-ppt-3d`
3. Read before writing with `officecli_read_document` or a narrow read command through `officecli_execute`.
4. Use the highest-level operation that can express the change:
   - L1: `view`, `get`, `query`, `validate`
   - L2: `set`, `add`, `remove`, `move`, `swap`
   - L3: `raw`, `raw-set`, `add-part`
5. Call `officecli_help` when a property, element type, selector, or argument is uncertain.
6. Pass `expectedVersionNumber` for every write.
7. Apply format-specific quality:
   - Word: use `officecli_apply_word_design` to create real reusable styles and optionally a TOC.
   - Excel: use formulas for derived values, explicit number formats and column widths, and styled headers/tables.
   - PowerPoint: define a coherent theme and hierarchy, use meaningful layouts and visuals, and check clipping or overflow.
8. After writing, run `validate`, inspect `view issues`, and check the native preview.
9. Return the latest native file with `officecli_get_file`.

The current native file is stored at a stable sandbox-visible path under
`/workspace/files/office-cli/documents/<documentId>/`. Hidden recovery snapshots
are stored in `.versions`, and the app retains the latest five snapshots. Never
invent or pass these paths to OfficeCLI commands; use the plugin tools and the
portable file reference returned by them.

Never claim that a write modified the current file when the tool did not return
`mutated: true` and a new version.

## Commands

`officecli_execute` accepts:

- `documentId`: exact plugin document id.
- `command`: one supported OfficeCLI document command.
- `args`: the arguments after the managed document path.
- `stdin`: optional batch JSON or CSV/TSV import data.
- `expectedVersionNumber`: required for safe writes.
- `changeSummary`: concise reason for the new version.
- `dangerousConfirmed`: explicit confirmation for `raw-set` or `add-part`.

Examples:

```json
{
  "documentId": "exact-id",
  "command": "view",
  "args": ["outline"]
}
```

```json
{
  "documentId": "exact-id",
  "command": "set",
  "args": ["/slide[1]/shape[@id=42]", "--prop", "fill=E5484D"],
  "expectedVersionNumber": 3,
  "changeSummary": "Set the selected title shape fill"
}
```

```json
{
  "documentId": "exact-id",
  "command": "batch",
  "args": [],
  "stdin": "[{\"command\":\"set\",\"path\":\"/Sheet1/A1\",\"props\":{\"value\":\"Revenue\",\"bold\":\"true\"}}]",
  "expectedVersionNumber": 2,
  "changeSummary": "Update dashboard header"
}
```

The plugin controls input and output file locations. Do not pass `-o`, `--output`, `--input`, or configuration paths.

## Visual selection

The Workbench renders OfficeCLI HTML in an isolated preview. When the renderer exposes a stable `data-path`, clicking an element opens an inline editor next to that element and sends the exact path to the Assistant request context. The user can edit the content and explicitly save it back through OfficeCLI. Prefer the selected stable path over a positional path.

If the preview does not expose a path for the desired element:

1. use `get / --depth 2`;
2. narrow with `query`;
3. select the returned path;
4. edit through L2 commands.

## Read patterns

- Structure: `view outline`
- Text: `view text`
- Formatting annotations: `view annotated`
- Problems: `view issues`
- Exact subtree: `get <path> --depth N`
- Search: `query <selector>`
- Package validation: `validate`
- Raw part inspection: `raw <part>`

Keep reads bounded. Avoid dumping the entire document when a narrow path, range, or selector is sufficient.

## Write patterns

- Property edit: `set <path> --prop key=value`
- Text replacement: `set / --prop find=old --prop replace=new`
- Add element: `add <parent> --type <type> --prop key=value`
- Reorder: `move <path> --to <parent> --index N`
- Delete: `remove <path>`
- Atomic multi-edit: `batch` with JSON on `stdin`
- CSV/TSV import: `import /Sheet1 --stdin --format csv` with the tabular data in `stdin`
- Template fill: `merge` with the template data argument

Use stable identifiers such as `@id`, `@name`, or `@paraId` when OfficeCLI returns them.

## Professional Word output

Assigning `style=Heading1` is insufficient if the DOCX has no actual Heading1
style definition. Before delivery, call:

```json
{
  "documentId": "exact-id",
  "expectedVersionNumber": 4,
  "includeTableOfContents": true,
  "bodyFont": "Arial",
  "eastAsiaFont": "等线",
  "accentColor": "1F4E79",
  "changeSummary": "应用专业标题样式并生成目录"
}
```

`officecli_apply_word_design` creates or updates real `Normal`, `Title`,
`Subtitle`, `Heading1`, `Heading2`, `Heading3`, and TOC styles, repairs legacy
heading references, inserts a native clickable TOC when requested, enables field
updates when the document opens, and validates the result. Word/WPS may calculate
final page numbers when opening the file.

## Raw OOXML

`raw-set` and `add-part` can invalidate relationships or package structure. Use them only when:

- L1/L2 cannot represent the requested operation;
- the target part and XPath were inspected first;
- the user approved the raw structural change;
- `dangerousConfirmed` is true;
- a post-write `validate` is planned.

## Recovery

- Version conflict: re-read the document and retry against the current version.
- Invalid property: call `officecli_help` for the exact format and element.
- Invalid path: inspect the nearest parent with `get --depth 1`.
- Failed validation: inspect `view issues`, restore the previous immutable version if needed, and report what failed.
- Rendering failure: preserve the native file and report the renderer error; do not replace it with a guessed snapshot.

See [command workflows](references/command-workflows.md) for format-specific examples.
