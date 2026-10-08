# Review, comments and text revisions

First run `documents.py inspect input.docx` and retain the original file.
Body paragraph indexes are zero-based in this helper. Tables are listed
separately. Match the displayed text before choosing an index.

Add a comment on an ordinary, non-empty body paragraph:

```sh
python3 <skill>/scripts/documents.py comment input.docx --paragraph 2 \
  --text 'Please confirm this date.' --author 'Reviewer' --output commented.docx
```

The helper anchors a comment to all paragraph runs using python-docx. It refuses
paragraphs containing fields, hyperlinks or existing review marks. Inspect the
saved comments and anchors, then render the new document.

For a tracked text replacement use:

```sh
python3 <skill>/scripts/documents.py replace input.docx --old 'Draft' --new 'Final' \
  --author 'Reviewer' --output revised.docx
```

This creates real Word insertion/deletion elements and retains run formatting.
It requires exactly one occurrence within one plain run in the main document.
It refuses existing revisions, ambiguous matches, fields and other complex runs
rather than flattening their content. For cross-run text, inspect OOXML and
design an explicit edit preserving all affected structures; this CLI does not
claim support for that case. It does not accept all pre-existing revisions.

Reopen the saved package to verify revision author, old/new text, comment parts,
relationships and anchors. Review the rendered layout too. A PDF is a visual
projection and cannot replace the editable DOCX review record.
