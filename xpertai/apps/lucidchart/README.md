# Lucidchart Plugin

Agentic Lucidchart plugin for Xpert and data-xpert. It provides Agent middleware tools, a Lucidchart Workbench, Assistant templates, and an installable Xpert skill for managing Standard Import drafts, Mermaid drafts, and external Lucid links.

Agent-created Standard Import diagrams use a bounded staged workflow: create metadata, apply up to 12 typed shape/line operations per stage, read pages in bounded slices, and finalize only after server-side Lucid schema validation. Complete arbitrary `document.json` objects are reserved for Workbench and file-import paths rather than model tool arguments.

Installable skills live under `skills/` and are advertised through `.xpertai-plugin/plugin.json`.
