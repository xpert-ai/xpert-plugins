# Editable PPTX authoring

The independent builder uses PptxGenJS 4.0.1, not `@oai/artifact-tool`.
Inputs are UTF-8 JSON; unknown fields fail instead of being silently ignored.
Canvas: 13.333333 x 7.5 inches (16:9). Coordinates are inches, font sizes points.

```json
{
  "title": "Quarterly review",
  "author": "Xpert",
  "theme": "light",
  "slides": [
    {
      "title": "Quarterly review",
      "layout": "cover",
      "notes": "Opening context and source attribution.",
      "elements": [
        {"type":"text","x":0.9,"y":3.4,"w":11.4,"h":1.2,"text":"Results and next steps","fontSize":24}
      ]
    },
    {
      "title": "Delivery progress",
      "notes": "Illustrative values; replace with verified data.",
      "elements": [
        {"type":"chart","x":0.8,"y":1.6,"w":7,"h":4.7,"chartType":"bar","series":[{"name":"Complete","labels":["Q1","Q2","Q3"],"values":[20,35,50]}]},
        {"type":"text","x":8.2,"y":2,"w":4.2,"h":2.5,"text":"Consistent growth\nNext: improve delivery quality","fontSize":22}
      ]
    }
  ]
}
```

Deck fields: required `title`, `slides`; optional `author`, `subject`, `theme`
(`light` or `navy`). Each slide has required `title`, `elements`; optional `layout`
(`content` default or `cover`) and `notes` (plain text, including source URLs).
Titles and page numbers are added as editable text. Reserve y=0.4..1.3 for
content titles and y=7.0..7.4 for the footer. On covers reserve y=1.2..2.9.
Keep most content within x=0.8..12.5, y=1.6..6.8.

All elements require `type`, `x`, `y`, `w`, `h` and use these extra fields:

| type | Required | Optional |
| --- | --- | --- |
| text | `text` (newlines allowed) | `fontSize` (default 22), `bold`, `color` (hex without #), `align` (left/center/right) |
| image | `path` (local PNG/JPEG, relative to spec) | `altText` |
| table | `rows` (rectangular array of strings, first row is header) | `fontSize` (default 18), `columnWidths` (inches, sum to w) |
| chart | `chartType` (bar/line/pie), `series` | `showLegend` |
| shape | `shape` (rect/roundRect/ellipse) | `fill`, `lineColor` (hex) |

Charts use `series: [{"name":"Revenue","labels":["Q1","Q2"],"values":[12,18]}]`.
All series must share labels; pie supports exactly one series and nonnegative
values. Native chart XML and embedded XLSX workbooks retain editable data.
Tables support 1..15 rows including the header and 1..8 columns. Do not squeeze
large tables onto one slide; split them deliberately. Native table layout may
grow for long text, so check rendered output. Text defaults to Noto Sans CJK SC.
Shapes are drawn in element order; use deliberate layering and review overlaps.

Run:

```sh
python3 <skill>/scripts/presentations.py build presentations/<task>/deck.json --output presentations/<task>/deck.pptx
python3 <skill>/scripts/presentations.py inspect presentations/<task>/deck.pptx
python3 <skill>/scripts/presentations.py render presentations/<task>/deck.pptx --output presentations/<task>/qa-v1
```

Use a new PPTX output for each iteration. Rendering supports up to 100 slides;
100 MiB archives / 300 MiB expanded content. Unsupported spec fields, malformed
packages, unresolved relationships or off-canvas input elements fail explicitly.
Source images are not fetched from the network. Supply verified assets locally.
