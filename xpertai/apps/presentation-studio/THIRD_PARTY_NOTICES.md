# Third-party notices

## dashiAI-ppt-skill

- Repository: https://github.com/chuspeeism/dashiAI-ppt-skill
- Pinned commit: `69ac66443e36e11cfca4a7f30721dc71a4278d28`
- License: GNU Affero General Public License v3.0
- Vendored source: `assets/upstream/dashiai-ppt`
- License text: `assets/upstream/LICENSE`

Presentation Studio modifies the vendored renderer to resolve its runtime JavaScript dependencies from the containing Xpert plugin package, and adds an optional machine-readable report flag to the vendored exporter so fallback warnings can be persisted. The 14 theme runtimes, 1188-layout manifest, editor template, exporter, assets, and their corresponding source are distributed with this plugin. `theme13` and `theme14` reuse the existing theme02/03/04/05/09/12 source modules through a shared generated-theme runtime graph. Exact local changes and the full-tree checksum are recorded in `assets/upstream/UPSTREAM.json`.

## html-deck-to-pptx

The DashiAI project includes `packages/html-deck-to-pptx`, licensed under the MIT License. Its license is retained in the vendored source tree.

## Presentation font pack

Presentation Studio resolves open-source web fonts from exact-version Fontsource npm dependencies instead of storing WOFF/WOFF2 binaries in the vendored DashiAI source tree. At render time it copies only the families referenced by the selected theme and generates `assets/fonts/FONT-LICENSES.txt`; self-contained HTML exports preserve that license document as a data URL.

| Fontsource package | Version | Font project | License |
| --- | --- | --- | --- |
| `@fontsource/anton` | 5.2.7 | Anton Project Authors | OFL-1.1 |
| `@fontsource/archivo` | 5.2.8 | Archivo Project Authors | OFL-1.1 |
| `@fontsource/caveat` | 5.2.8 | Caveat Project Authors | OFL-1.1 |
| `@fontsource/ibm-plex-mono` | 5.2.7 | IBM Corp. | OFL-1.1 |
| `@fontsource/ibm-plex-sans` | 5.2.8 | IBM Corp. | OFL-1.1 |
| `@fontsource/inter` | 5.2.8 | Inter Project Authors | OFL-1.1 |
| `@fontsource/jetbrains-mono` | 5.2.8 | JetBrains Mono Project Authors | OFL-1.1 |
| `@fontsource/newsreader` | 5.2.10 | Newsreader Project Authors | OFL-1.1 |
| `@fontsource/space-grotesk` | 5.2.10 | Space Grotesk Project Authors | OFL-1.1 |
| `@fontsource/space-mono` | 5.2.9 | Space Mono Project Authors | OFL-1.1 |

The authoritative attribution strings and OFL text are read from each installed Fontsource package while the deck font pack is generated. Fontsource package metadata is available at [fontsource.org](https://fontsource.org/).
