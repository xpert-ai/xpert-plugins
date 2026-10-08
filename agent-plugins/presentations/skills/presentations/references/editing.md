# Conservative editing

`inspect <input.pptx>` reads slide order from the presentation relationships,
not ZIP filename sorting. It reports source hash, page size, all slide text,
speaker notes, native tables, chart categories/values, images and shape IDs.
Grouped text appears in `allText` but is not a v1 editing target. Extraction
does not prove layout or full accessibility/animation support.

After a user edits in the Files panel, they must SAVE. The Agent then inspects
the latest saved workspace path. An unsaved editor buffer is not that file.

```sh
python3 <skill>/scripts/presentations.py inspect <latest-saved.pptx>
python3 <skill>/scripts/presentations.py replace-text <latest-saved.pptx> \
  --slide 1 --shape-id 3 --old 'Before' --new 'After' \
  --expected-sha256 <hash-from-inspect> --output <new-copy.pptx>
python3 <skill>/scripts/presentations.py render <new-copy.pptx> --output <new-qa-directory>
```

The helper requires exactly one match within one text run of one top-level
text shape. It retains run styling and copies every other ZIP part unchanged.
It rejects stale hashes, same-file outputs, ambiguous/cross-run matches and
table/chart/group/master targets. Do not bypass rejection by rebuilding an
uploaded deck without the user's agreement. Text changes may overflow; inspect
and visually review all slides after editing.

V1 rendering rejects hidden slides, embedded OLE objects and external data/media
links (ordinary hyperlinks are preserved), and checks PDF page count against
the PPTX. Signed and macro-enabled decks are unsupported. LibreOffice rendering
can differ from Microsoft PowerPoint, especially with unavailable fonts,
SmartArt, advanced effects or animations. The original remains unchanged;
the platform browser editor is a separate preview/edit implementation. Preserve
the PPTX for native PowerPoint review when exact cross-application fidelity matters.
