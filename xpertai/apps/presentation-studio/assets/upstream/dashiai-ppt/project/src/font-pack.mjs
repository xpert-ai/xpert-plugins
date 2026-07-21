import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const requireFromFontPack = createRequire(import.meta.url);

// Font binaries come from version-pinned Fontsource dependencies. They are staged into a
// rendered deck only when its selected theme runtime references the corresponding family.
const FONT_CATALOG = [
  font('Anton', 'anton', [[400]]),
  font('Archivo', 'archivo', [[400], [500], [600], [700], [800], [900]]),
  font('Caveat', 'caveat', [[400], [600], [700]]),
  font('IBM Plex Mono', 'ibm-plex-mono', [[200], [300], [400], [400, 'italic'], [500], [600]]),
  font('IBM Plex Sans', 'ibm-plex-sans', [[200], [300], [400], [500]]),
  font('Inter', 'inter', [[400], [500], [600], [700], [800], [900]], { shellFaces: [[400], [500], [600], [700]] }),
  font('JetBrains Mono', 'jetbrains-mono', [[400], [500], [600]]),
  font('Newsreader', 'newsreader', [[300, 'italic'], [400, 'italic'], [500], [500, 'italic'], [800], [800, 'italic']]),
  font('Space Grotesk', 'space-grotesk', [[300], [400], [500], [600], [700]]),
  font('Space Mono', 'space-mono', [[400], [700]], { shellFaces: [[400], [700]] }),
];

export const PRESENTATION_FONT_PACKAGES = Object.freeze(
  Object.fromEntries(FONT_CATALOG.map(entry => [entry.packageName, entry.family])),
);

export function stagePresentationFontPack(root, outDir, usedThemeKeys = []) {
  const selected = selectFonts(root, usedThemeKeys);
  const fontRoot = path.join(outDir, 'assets/fonts');
  fs.mkdirSync(fontRoot, { recursive: true });

  const css = [];
  const manifest = { formatVersion: 1, packages: [], files: [] };
  for (const entry of selected) {
    const packageJsonPath = requireFromFontPack.resolve(`${entry.packageName}/package.json`);
    const packageRoot = path.dirname(packageJsonPath);
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const metadata = JSON.parse(fs.readFileSync(requireFromFontPack.resolve(`${entry.packageName}/metadata.json`), 'utf8'));
    if (packageJson.license !== 'OFL-1.1' || metadata?.license?.type !== 'OFL-1.1') {
      throw new Error(`Presentation font package must use OFL-1.1: ${entry.packageName}`);
    }
    manifest.packages.push({
      name: entry.packageName,
      version: packageJson.version,
      family: entry.family,
      license: packageJson.license,
      attribution: metadata.license.attribution,
    });
    for (const [weight, style = 'normal'] of entry.faces) {
      const cssName = style === 'italic' ? `${weight}-italic.css` : `${weight}.css`;
      const cssPath = requireFromFontPack.resolve(`${entry.packageName}/${cssName}`);
      const source = fs.readFileSync(cssPath, 'utf8');
      css.push(rewriteFontsourceCss(source, entry, packageRoot, fontRoot, manifest));
    }
  }

  const license = fs.readFileSync(requireFromFontPack.resolve('@fontsource/inter/LICENSE'), 'utf8').trim();
  fs.writeFileSync(
    path.join(fontRoot, 'FONT-LICENSES.txt'),
    [
      'Presentation Studio font pack',
      '',
      ...manifest.packages.map(item => `${item.name}@${item.version} — ${item.family} — ${item.license}\n${item.attribution}`),
      '',
      license,
      '',
    ].join('\n'),
  );
  fs.writeFileSync(path.join(fontRoot, 'font-pack.css'), `${fontPackHeader(manifest)}\n${css.join('\n')}\n`);
  fs.writeFileSync(path.join(fontRoot, 'font-pack.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function selectFonts(root, usedThemeKeys) {
  const keys = usedThemeKeys.length ? usedThemeKeys : Array.from({ length: 14 }, (_, index) => `theme${String(index + 1).padStart(2, '0')}`);
  const themeSource = keys.map(key => {
    const file = path.join(root, 'dist/theme-runtime', `imported-theme-runtime.${key}.js`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  }).join('\n');
  return FONT_CATALOG.flatMap(entry => {
    if (themeSource.includes(entry.family)) return [entry];
    return entry.shellFaces.length ? [{ ...entry, faces: entry.shellFaces }] : [];
  });
}

function rewriteFontsourceCss(source, entry, packageRoot, fontRoot, manifest) {
  return source.replace(/^  src:.*;$/gm, line => {
    const match = line.match(/url\((?:['"])?\.\/files\/([^)'"\s]+\.woff2)(?:['"])?\)\s*format\((?:['"])woff2(?:['"])\)/);
    if (!match) throw new Error(`Fontsource CSS has no WOFF2 source: ${entry.packageName}`);
    const fileName = match[1];
    const sourceFile = path.join(packageRoot, 'files', fileName);
    const targetDir = path.join(fontRoot, entry.id);
    const targetFile = path.join(targetDir, fileName);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
    const buffer = fs.readFileSync(sourceFile);
    manifest.files.push({
      path: `assets/fonts/${entry.id}/${fileName}`,
      bytes: buffer.byteLength,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    });
    return `  src: url('./${entry.id}/${fileName}') format('woff2');`;
  });
}

function fontPackHeader(manifest) {
  const packages = manifest.packages.map(item => `${item.name}@${item.version}`).join(', ');
  return `/* Generated from ${packages}. Licenses: ./FONT-LICENSES.txt */`;
}

function font(family, id, faces, options = {}) {
  return { family, id, packageName: `@fontsource/${id}`, faces, shellFaces: options.shellFaces ?? [] };
}
