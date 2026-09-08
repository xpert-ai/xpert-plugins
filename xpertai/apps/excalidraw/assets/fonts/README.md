# Quality preview font

Noto Sans CJK SC Regular, release Sans2.004.

Source: https://github.com/notofonts/noto-cjk/blob/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf

SHA-256: `2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b`

Distributed unmodified under the SIL Open Font License in OFL.txt. Resvg loads this OTF explicitly with system fonts disabled; browser exports keep Excalidraw’s pinned font bundle.

Only this documentation, `manifest.json` and `OFL.txt` belong in Git. The manifest pins the download URL, release, byte size and SHA-256. Build and test run `prepare:fonts` to verify the cached font or download it, then copy it and these provenance files into `dist/assets/fonts/`. The published package contains this generated directory; preview rendering needs no network access.

The default cache is `node_modules/.cache/excalidraw-fonts` inside the plugin. Set `XPERT_EXCALIDRAW_FONT_CACHE` to an absolute directory to share or restore a CI cache. Cache filenames include the SHA-256, and every cache hit is verified before use. Failed downloads cannot replace a verified cache entry.

For offline builds, populate that cache once, then set `XPERT_EXCALIDRAW_FONTS_OFFLINE=1`. A missing or corrupt cache fails with a preparation hint instead of using system fonts or silently changing the output. To reproduce the first build, use an empty cache directory and run the build normally. Do not restore an OTF file into this source directory.
