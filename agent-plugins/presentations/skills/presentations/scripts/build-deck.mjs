import { createRequire } from 'node:module';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { validateSpec } from './deck-spec.mjs';

const root = process.env.XPERT_PRESENTATIONS_RUNTIME || join(homedir(), '.local/share/xpert/presentations');
const require = createRequire(join(root, 'package.json'));
const PptxGenJS = require('pptxgenjs');
const { imageSize } = require('image-size');
const themes = {
  light: { background: 'F8FAFC', foreground: '16243B', muted: '52647A', accent: '2160CB', panel: 'E5EDF9' },
  navy: { background: '102238', foreground: 'F4F7FC', muted: 'B9C9DD', accent: '42C9B0', panel: '1C3854' },
};

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Presentations requires Node.js 22 or newer');
  if (process.argv[2] === '--doctor') {
    console.log(JSON.stringify({ node: process.version, runtime: root, pptxgenjs: new PptxGenJS().version }));
    return;
  }
  const [, , input, output] = process.argv;
  const raw = await readFile(input, 'utf8');
  if (raw.length > 2 * 1024 * 1024) throw new Error('Deck spec exceeds 2 MiB');
  const spec = await validateSpec(JSON.parse(raw), dirname(resolve(input)));
  const colors = themes[spec.theme || 'light'];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; pptx.author = spec.author || 'Xpert';
  pptx.subject = spec.subject || ''; pptx.title = spec.title; pptx.company = 'Xpert';
  pptx.lang = 'zh-CN';
  pptx.theme = { headFontFace: 'Noto Sans CJK SC', bodyFontFace: 'Noto Sans CJK SC', lang: 'zh-CN' };
  const base = { fontFace: 'Noto Sans CJK SC', color: colors.foreground, margin: 0,
    breakLine: false, valign: 'mid', fit: 'resize', lang: 'zh-CN' };
  for (const [index, page] of spec.slides.entries()) {
    const slide = pptx.addSlide(); slide.background = { color: colors.background };
    const cover = page.layout === 'cover';
    slide.addShape(pptx.ShapeType.rect, { x: 0.6, y: cover ? 1.2 : 0.48, w: 0.09, h: cover ? 1.7 : 0.65,
      line: { transparency: 100 }, fill: { color: colors.accent } });
    slide.addText(page.title, { ...base, x: 0.88, y: cover ? 1.2 : 0.42, w: 11.6,
      h: cover ? 1.7 : 0.85, fontSize: cover ? 38 : 28, bold: true });
    slide.addText(`${index + 1} / ${spec.slides.length}`, { ...base, x: 11.7, y: 7.06, w: 0.95,
      h: 0.22, fontSize: 10, color: colors.muted, align: 'right' });
    for (const el of page.elements) {
      const position = { x: el.x, y: el.y, w: el.w, h: el.h };
      switch (el.type) {
        case 'text':
          slide.addText(el.text, { ...base, ...position, fontSize: el.fontSize || 22,
            bold: el.bold || false, color: el.color || colors.foreground, align: el.align || 'left',
            paraSpaceAfterPt: 10 });
          break;
        case 'image':
          {
            const size = imageSize(await readFile(el.path));
            const scale = Math.min(el.w / size.width, el.h / size.height);
            const w = size.width * scale, h = size.height * scale;
            slide.addImage({ path: el.path, x: el.x + (el.w - w) / 2, y: el.y + (el.h - h) / 2,
              w, h, altText: el.altText || '' });
          }
          break;
        case 'shape':
          slide.addShape(pptx.ShapeType[el.shape], { ...position,
            fill: { color: el.fill || colors.panel }, line: { color: el.lineColor || el.fill || colors.panel } });
          break;
        case 'table':
          slide.addTable(el.rows.map((row, i) => row.map(cell => ({ text: cell, options: i === 0 ?
            { bold: true, fill: colors.accent, color: spec.theme === 'navy' ? '102238' : 'FFFFFF' } : {} }))),
          { ...base, ...position, fontSize: el.fontSize || 18, autoPage: false,
            rowH: el.h / el.rows.length, colW: el.columnWidths || Array(el.rows[0].length).fill(el.w / el.rows[0].length),
            margin: 8, border: { type: 'solid', color: colors.muted, pt: 0.6 },
            fill: colors.background });
          break;
        case 'chart':
          slide.addChart(pptx.ChartType[el.chartType], el.series, { ...position,
            catAxisLabelFontFace: base.fontFace, valAxisLabelFontFace: base.fontFace,
            catAxisLabelFontSize: 14, valAxisLabelFontSize: 12, catAxisLabelColor: colors.foreground,
            valAxisLabelColor: colors.foreground, legendColor: colors.foreground,
            legendFontFace: base.fontFace, legendFontSize: 12,
            showLegend: el.showLegend ?? (el.series.length > 1 || el.chartType === 'pie'),
            showTitle: false, showValue: false, showPercent: el.chartType === 'pie',
            chartColors: [colors.accent, '7792C6', 'E6A852', 'CB6380', '779D7F', '9575B5'],
            showBorder: false,
            showMarker: el.chartType === 'line',
            catAxisTitleColor: colors.foreground, valAxisTitleColor: colors.foreground,
            chartArea: { fill: { color: colors.background } },
            plotArea: { fill: { color: colors.background } },
            layout: { x: 0.12, y: 0.06, w: 0.8, h: 0.8 },
          });
          break;
      }
    }
    if (page.notes) slide.addNotes(page.notes);
  }
  let created = false;
  try {
    // Exclusive creation also protects callers that bypass the Python wrapper.
    const bytes = await pptx.write({ outputType: 'nodebuffer' });
    await writeFile(output, bytes, { flag: 'wx' }); created = true;
    console.log(JSON.stringify({ output, slideCount: spec.slides.length, theme: spec.theme || 'light' }));
  } catch (error) {
    if (created) await rm(output, { force: true });
    throw error;
  }
}
main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
