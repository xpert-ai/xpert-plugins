# Attribution and provenance

This is an unofficial, independent JavaScript/CSS implementation of an AvalonDock-style browser docking component. It is not an Xceed product, endorsed port, or substitute license for upstream software. The `Xceed.Wpf.AvalonDock` global alias exists only as an API naming adapter.

No Xceed C# implementation files, WPF theme dictionaries, product artwork, logos, or bundled fonts are included. The JavaScript/CSS and sample were written for this package. Public source declarations and selected behavior/serialization implementation were inspected for interoperability reference. Accordingly, the work is **not represented as a two-team clean-room implementation**.

The upstream source inspected identifies its copyright as Xceed Software Inc., 2007–2025, and refers to the Xceed Community License Agreement for non-commercial use. That license governs upstream materials, not a grant made by this project. Consult the upstream license for its terms; this notice is not legal advice or an assurance about a particular migration/commercial deployment.

## Primary references

- AvalonDock wiki: https://github.com/xceedsoftware/wpftoolkit/wiki/AvalonDock
- DockingManager wiki: https://github.com/xceedsoftware/wpftoolkit/wiki/DockingManager
- Source directory: https://github.com/xceedsoftware/wpftoolkit/tree/master/ExtendedWPFToolkitSolution/Src/Xceed.Wpf.AvalonDock
- Upstream license: https://github.com/xceedsoftware/wpftoolkit/blob/master/license.md

## Inspected blob references

These identify specific files seen during API/serialization research. They are blob IDs, not a claim that a complete repository revision was cloned or qualified.

| File under the source directory | Blob SHA |
|---|---|
| DockingManager.cs, directory metadata | `37f2df4b415ba9e5dbb5241f9ce22f5c90c2594e` |
| Layout/LayoutContent.cs | `9fc0949cd6ad3118f4eb6beec54dff64cb0ccb6b` |
| Layout/LayoutRoot.cs | `a9403753991afc268653259439e13729ac801b99` |
| Layout/Serialization/XmlLayoutSerializer.cs | `8332d13de2262b058607fc0e8bd9130b65b5b924` |
| Layout/LayoutDocumentFloatingWindow.cs | `e17357144266da04e9f3ceccd326ec55b506737b` |
| Layout/AnchorableShowStrategy.cs | `34d7bda5d3c1337225841156fb735bd02abbdfe7` |

The inspected enum values are retained for compatibility: Most=1, Left=2, Right=4, Top=16, Bottom=32. The XML root/sides/floating/hidden structure was used as an interoperability reference. The scope and unverified native behaviors are documented in `docs/COMPATIBILITY.md`.
