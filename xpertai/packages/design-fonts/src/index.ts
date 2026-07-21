export type DesignSurface = 'sites' | 'pencil' | 'presentation' | 'excalidraw' | 'canvas'
export type DesignFontStyle = 'normal' | 'italic'

export type OnlineFontFace = {
  url: string
  weight: number
  style: DesignFontStyle
  format: 'woff2'
}

export type OnlineFontFamily = {
  id: string
  family: string
  fallback: 'sans-serif' | 'serif' | 'monospace' | 'cursive'
  languages: readonly string[]
  tags: readonly string[]
  license: 'OFL-1.1'
  packageName: string
  packageVersion: string
  stylesheetUrl?: string
  faces: readonly OnlineFontFace[]
}

export type TypographyPreset = {
  id: string
  label: string
  description: string
  languages: readonly string[]
  tags: readonly string[]
  heading: string
  body: string
  mono?: string
  surfaces: readonly DesignSurface[]
  excalidrawFamily?: 'Virgil' | 'Helvetica' | 'Cascadia' | 'Excalifont' | 'Nunito' | 'Lilita One' | 'Comic Shanns' | 'Liberation Sans'
}

export type PencilOnlineFontSource = {
  family: string
  style: string
  url: string
}

const cdn = (packageName: string, version: string, file: string) =>
  `https://cdn.jsdelivr.net/npm/${packageName}@${version}/${file}`

const face = (packageName: string, version: string, file: string, weight: number, style: DesignFontStyle = 'normal'): OnlineFontFace => ({
  url: cdn(packageName, version, `files/${file}`),
  weight,
  style,
  format: 'woff2'
})

export const ONLINE_FONT_FAMILIES = [
  {
    id: 'inter', family: 'Inter', fallback: 'sans-serif', languages: ['en'], tags: ['neutral', 'ui', 'enterprise'],
    license: 'OFL-1.1', packageName: '@fontsource/inter', packageVersion: '5.2.8',
    faces: [
      face('@fontsource/inter', '5.2.8', 'inter-latin-400-normal.woff2', 400),
      face('@fontsource/inter', '5.2.8', 'inter-latin-500-normal.woff2', 500),
      face('@fontsource/inter', '5.2.8', 'inter-latin-600-normal.woff2', 600),
      face('@fontsource/inter', '5.2.8', 'inter-latin-700-normal.woff2', 700)
    ]
  },
  {
    id: 'space-grotesk', family: 'Space Grotesk', fallback: 'sans-serif', languages: ['en'], tags: ['modern', 'technology', 'display'],
    license: 'OFL-1.1', packageName: '@fontsource/space-grotesk', packageVersion: '5.2.10',
    faces: [
      face('@fontsource/space-grotesk', '5.2.10', 'space-grotesk-latin-400-normal.woff2', 400),
      face('@fontsource/space-grotesk', '5.2.10', 'space-grotesk-latin-500-normal.woff2', 500),
      face('@fontsource/space-grotesk', '5.2.10', 'space-grotesk-latin-600-normal.woff2', 600),
      face('@fontsource/space-grotesk', '5.2.10', 'space-grotesk-latin-700-normal.woff2', 700)
    ]
  },
  {
    id: 'newsreader', family: 'Newsreader', fallback: 'serif', languages: ['en'], tags: ['editorial', 'serif', 'storytelling'],
    license: 'OFL-1.1', packageName: '@fontsource/newsreader', packageVersion: '5.2.10',
    faces: [
      face('@fontsource/newsreader', '5.2.10', 'newsreader-latin-400-normal.woff2', 400),
      face('@fontsource/newsreader', '5.2.10', 'newsreader-latin-500-normal.woff2', 500),
      face('@fontsource/newsreader', '5.2.10', 'newsreader-latin-800-normal.woff2', 800),
      face('@fontsource/newsreader', '5.2.10', 'newsreader-latin-400-italic.woff2', 400, 'italic')
    ]
  },
  {
    id: 'jetbrains-mono', family: 'JetBrains Mono', fallback: 'monospace', languages: ['en'], tags: ['code', 'technical', 'mono'],
    license: 'OFL-1.1', packageName: '@fontsource/jetbrains-mono', packageVersion: '5.2.8',
    faces: [
      face('@fontsource/jetbrains-mono', '5.2.8', 'jetbrains-mono-latin-400-normal.woff2', 400),
      face('@fontsource/jetbrains-mono', '5.2.8', 'jetbrains-mono-latin-500-normal.woff2', 500),
      face('@fontsource/jetbrains-mono', '5.2.8', 'jetbrains-mono-latin-600-normal.woff2', 600)
    ]
  },
  {
    id: 'ibm-plex-sans', family: 'IBM Plex Sans', fallback: 'sans-serif', languages: ['en'], tags: ['technical', 'enterprise', 'readable'],
    license: 'OFL-1.1', packageName: '@fontsource/ibm-plex-sans', packageVersion: '5.2.8',
    faces: [
      face('@fontsource/ibm-plex-sans', '5.2.8', 'ibm-plex-sans-latin-400-normal.woff2', 400),
      face('@fontsource/ibm-plex-sans', '5.2.8', 'ibm-plex-sans-latin-500-normal.woff2', 500),
      face('@fontsource/ibm-plex-sans', '5.2.8', 'ibm-plex-sans-latin-700-normal.woff2', 700)
    ]
  },
  {
    id: 'caveat', family: 'Caveat', fallback: 'cursive', languages: ['en'], tags: ['handwritten', 'friendly', 'sketch'],
    license: 'OFL-1.1', packageName: '@fontsource/caveat', packageVersion: '5.2.8',
    faces: [
      face('@fontsource/caveat', '5.2.8', 'caveat-latin-400-normal.woff2', 400),
      face('@fontsource/caveat', '5.2.8', 'caveat-latin-600-normal.woff2', 600),
      face('@fontsource/caveat', '5.2.8', 'caveat-latin-700-normal.woff2', 700)
    ]
  },
  {
    id: 'anton', family: 'Anton', fallback: 'sans-serif', languages: ['en'], tags: ['bold', 'display', 'impact'],
    license: 'OFL-1.1', packageName: '@fontsource/anton', packageVersion: '5.2.7',
    faces: [face('@fontsource/anton', '5.2.7', 'anton-latin-400-normal.woff2', 400)]
  },
  {
    id: 'noto-sans-sc', family: 'Noto Sans SC Variable', fallback: 'sans-serif', languages: ['zh-Hans', 'en'], tags: ['cjk', 'chinese', 'neutral', 'ui'],
    license: 'OFL-1.1', packageName: '@fontsource-variable/noto-sans-sc', packageVersion: '5.2.10',
    stylesheetUrl: cdn('@fontsource-variable/noto-sans-sc', '5.2.10', 'index.css'),
    faces: []
  }
] as const satisfies readonly OnlineFontFamily[]

export const TYPOGRAPHY_PRESETS = [
  preset('neutral-ui', 'Neutral UI', 'Restrained product and enterprise typography.', ['en'], ['ui', 'enterprise', 'neutral'], 'Inter', 'Inter', 'JetBrains Mono', 'Nunito'),
  preset('modern-tech', 'Modern Tech', 'Geometric headings with highly readable product copy.', ['en'], ['technology', 'saas', 'modern'], 'Space Grotesk', 'Inter', 'JetBrains Mono', 'Liberation Sans'),
  preset('editorial', 'Editorial', 'Serif-led storytelling and publication typography.', ['en'], ['editorial', 'storytelling'], 'Newsreader', 'Inter', undefined, 'Helvetica'),
  preset('developer', 'Developer', 'Technical product typography with a dedicated code face.', ['en'], ['developer', 'technical', 'code'], 'IBM Plex Sans', 'IBM Plex Sans', 'JetBrains Mono', 'Cascadia'),
  preset('expressive', 'Expressive', 'High-impact display headings with restrained body copy.', ['en'], ['bold', 'marketing', 'display'], 'Anton', 'IBM Plex Sans', undefined, 'Lilita One'),
  preset('handwritten', 'Handwritten', 'Friendly hand-drawn emphasis with readable supporting copy.', ['en'], ['friendly', 'sketch', 'education'], 'Caveat', 'Inter', undefined, 'Excalifont'),
  preset('zh-modern', 'Chinese Modern', 'Deterministic Simplified Chinese UI typography.', ['zh-Hans', 'en'], ['chinese', 'ui', 'enterprise'], 'Noto Sans SC Variable', 'Noto Sans SC Variable', 'JetBrains Mono', 'Nunito')
] as const satisfies readonly TypographyPreset[]

const EXCALIDRAW_FONT_FAMILY_IDS: Readonly<Record<NonNullable<TypographyPreset['excalidrawFamily']>, number>> = {
  Virgil: 1,
  Helvetica: 2,
  Cascadia: 3,
  Excalifont: 4,
  Nunito: 5,
  'Lilita One': 6,
  'Comic Shanns': 7,
  'Liberation Sans': 8
}

function preset(
  id: string,
  label: string,
  description: string,
  languages: readonly string[],
  tags: readonly string[],
  heading: string,
  body: string,
  mono: string | undefined,
  excalidrawFamily: TypographyPreset['excalidrawFamily']
): TypographyPreset {
  return {
    id, label, description, languages, tags, heading, body,
    ...(mono ? { mono } : {}),
    surfaces: ['sites', 'pencil', 'presentation', 'excalidraw', 'canvas'],
    excalidrawFamily
  }
}

export function getOnlineFontFamily(family: string): OnlineFontFamily | undefined {
  return ONLINE_FONT_FAMILIES.find((item) => item.family === family)
}

export function getOnlineFontFace(family: string, weight: number, style: DesignFontStyle = 'normal') {
  const font = getOnlineFontFamily(family)
  return font?.faces.find((item) => item.weight === weight && item.style === style)
    ?? font?.faces.find((item) => item.weight === weight && item.style === 'normal')
    ?? font?.faces[0]
}

export function createTldrawOnlineFontAssetUrls() {
  const regular = (family: string) => getOnlineFontFace(family, 400)?.url ?? ''
  const bold = (family: string) => getOnlineFontFace(family, 700)?.url ?? regular(family)
  return {
    tldraw_draw: regular('Caveat'),
    tldraw_draw_italic: regular('Caveat'),
    tldraw_draw_bold: bold('Caveat'),
    tldraw_draw_italic_bold: bold('Caveat'),
    tldraw_sans: regular('Inter'),
    tldraw_sans_italic: regular('Inter'),
    tldraw_sans_bold: bold('Inter'),
    tldraw_sans_italic_bold: bold('Inter'),
    tldraw_serif: regular('Newsreader'),
    tldraw_serif_italic: getOnlineFontFace('Newsreader', 400, 'italic')?.url ?? regular('Newsreader'),
    tldraw_serif_bold: getOnlineFontFace('Newsreader', 800)?.url ?? regular('Newsreader'),
    tldraw_serif_italic_bold: getOnlineFontFace('Newsreader', 800, 'italic')?.url ?? getOnlineFontFace('Newsreader', 800)?.url ?? regular('Newsreader'),
    tldraw_mono: regular('JetBrains Mono'),
    tldraw_mono_italic: regular('JetBrains Mono'),
    tldraw_mono_bold: getOnlineFontFace('JetBrains Mono', 600)?.url ?? regular('JetBrains Mono'),
    tldraw_mono_italic_bold: getOnlineFontFace('JetBrains Mono', 600)?.url ?? regular('JetBrains Mono')
  }
}

export function createPencilOnlineFontSources(): readonly PencilOnlineFontSource[] {
  return ONLINE_FONT_FAMILIES.flatMap((font) => font.faces.map((item) => ({
    family: font.family,
    style: pencilFontStyle(item.weight, item.style),
    url: item.url
  })))
}

function pencilFontStyle(weight: number, style: DesignFontStyle) {
  const weightName = weight === 400 ? 'Regular'
    : weight === 500 ? 'Medium'
      : weight === 600 ? 'SemiBold'
        : weight === 700 ? 'Bold'
          : weight === 800 ? 'ExtraBold'
            : String(weight)
  return style === 'italic' ? (weight === 400 ? 'Italic' : `${weightName} Italic`) : weightName
}

export function listTypographyPresets(surface: DesignSurface) {
  return TYPOGRAPHY_PRESETS.filter((preset) => preset.surfaces.some((item) => item === surface))
}

export function buildOnlineFontFaceCss(families: readonly string[]) {
  const selected = [...new Set(families)]
    .map(getOnlineFontFamily)
    .filter((font): font is OnlineFontFamily => Boolean(font))
  const imports = selected
    .filter((font) => font.stylesheetUrl)
    .map((font) => `@import url('${font.stylesheetUrl}');`)
  const faces = selected.flatMap((font) => font.faces.map((item) => [
    '@font-face {',
    `  font-family: '${font.family}';`,
    `  src: url('${item.url}') format('${item.format}');`,
    `  font-style: ${item.style};`,
    `  font-weight: ${item.weight};`,
    '  font-display: swap;',
    '}'
  ].join('\n')))
  return [...imports, ...faces].join('\n\n')
}

export function serializeTypographyPresets(surface: DesignSurface) {
  return listTypographyPresets(surface).map((preset) => ({
    ...preset,
    ...(surface === 'excalidraw' && preset.excalidrawFamily
      ? { fontFamilyId: EXCALIDRAW_FONT_FAMILY_IDS[preset.excalidrawFamily] }
      : {}),
    ...(surface === 'canvas'
      ? { canvasFont: preset.id === 'handwritten' ? 'draw' : preset.id === 'editorial' ? 'serif' : preset.id === 'developer' ? 'mono' : 'sans' }
      : {}),
    css: surface === 'sites'
      ? buildOnlineFontFaceCss([preset.heading, preset.body, ...(preset.mono ? [preset.mono] : [])])
      : undefined
  }))
}
