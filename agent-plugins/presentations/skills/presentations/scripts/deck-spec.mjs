// The public v1 schema deliberately exposes only native, editable slide objects.
import { stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

function object(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: expected an object`);
  for (const key of Object.keys(value)) if (!fields.includes(key)) throw new Error(`${label}: unsupported field ${key}`);
}
function text(value, label, max = 4000) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}: expected text, at most ${max} characters`);
}
function number(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: expected ${min}..${max}`);
}
function color(value) {
  if (value !== undefined && (typeof value !== 'string' || !/^[a-f0-9]{6}$/i.test(value)))
    throw new Error('Colors must be six hexadecimal digits without #');
}
function choice(value, options, label) {
  if (value !== undefined && !options.includes(value)) throw new Error(`${label}: expected ${options.join(', ')}`);
}
function boolean(value, label) {
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`${label}: expected boolean`);
}

export async function validateSpec(spec, directory) {
  object(spec, ['title', 'author', 'subject', 'theme', 'slides'], 'deck');
  text(spec.title, 'title', 200);
  for (const key of ['author', 'subject']) if (spec[key] !== undefined) text(spec[key], key, 200);
  choice(spec.theme, ['light', 'navy'], 'theme');
  if (!Array.isArray(spec.slides) || spec.slides.length < 1 || spec.slides.length > 100) throw new Error('Expected 1..100 slides');
  for (const [index, slide] of spec.slides.entries()) {
    object(slide, ['title', 'layout', 'notes', 'elements'], `slide ${index + 1}`);
    text(slide.title, 'slide title', 160);
    choice(slide.layout, ['cover', 'content'], 'layout');
    if (slide.notes !== undefined) text(slide.notes, 'notes', 10000);
    if (!Array.isArray(slide.elements) || slide.elements.length > 80) throw new Error('Expected at most 80 elements per slide');
    for (const el of slide.elements) {
      const common = ['type', 'x', 'y', 'w', 'h'];
      const extra = {
        text: ['text', 'fontSize', 'bold', 'color', 'align'],
        image: ['path', 'altText'],
        table: ['rows', 'fontSize', 'columnWidths'],
        chart: ['chartType', 'series', 'showLegend'],
        shape: ['shape', 'fill', 'lineColor'],
      };
      if (!el || !Object.hasOwn(extra, el.type)) throw new Error('Element type must be text, image, table, chart or shape');
      object(el, [...common, ...extra[el.type]], el.type);
      number(el.x, 0, 13.333334, 'x'); number(el.y, 0, 7.5, 'y');
      number(el.w, 0.05, 13.333334, 'w'); number(el.h, 0.05, 7.5, 'h');
      if (el.x + el.w > 13.333334 || el.y + el.h > 7.500001) throw new Error('Element extends beyond the slide');
      if (el.fontSize !== undefined) number(el.fontSize, 10, 72, 'fontSize');
      if (el.type === 'text') {
        text(el.text, 'text'); color(el.color); boolean(el.bold, 'bold');
        choice(el.align, ['left', 'center', 'right'], 'align');
      } else if (el.type === 'image') {
        text(el.path, 'path', 4096);
        if (/^[a-z]+:\/\//i.test(el.path)) throw new Error('Images must be local PNG or JPEG files');
        el.path = resolve(directory, el.path);
        const info = await stat(el.path);
        if (!info.isFile() || info.size > 20 * 1024 * 1024 || !['.png', '.jpg', '.jpeg'].includes(extname(el.path).toLowerCase()))
          throw new Error('Images must be local PNG/JPEG files under 20 MiB');
        if (el.altText !== undefined) text(el.altText, 'altText', 500);
      } else if (el.type === 'table') {
        if (!Array.isArray(el.rows) || !el.rows.length || el.rows.length > 15) throw new Error('Tables support 1..15 rows including the header');
        const columns = el.rows[0]?.length;
        if (!columns || columns > 8) throw new Error('Tables support 1..8 columns');
        for (const row of el.rows) {
          if (!Array.isArray(row) || row.length !== columns) throw new Error('Table rows must have the same length');
          row.forEach(cell => text(cell, 'cell', 300));
        }
        if (el.columnWidths !== undefined) {
          if (!Array.isArray(el.columnWidths) || el.columnWidths.length !== columns) throw new Error('columnWidths must match columns');
          el.columnWidths.forEach(width => number(width, 0.1, el.w, 'columnWidth'));
          if (Math.abs(el.columnWidths.reduce((a, b) => a + b, 0) - el.w) > 0.01) throw new Error('columnWidths must sum to w');
        }
      } else if (el.type === 'chart') {
        choice(el.chartType, ['bar', 'line', 'pie'], 'chartType');
        if (!el.chartType) throw new Error('chartType is required');
        boolean(el.showLegend, 'showLegend');
        if (!Array.isArray(el.series) || !el.series.length || el.series.length > 6 || (el.chartType === 'pie' && el.series.length !== 1))
          throw new Error('Charts require 1..6 series; pie requires one');
        let labels;
        for (const series of el.series) {
          object(series, ['name', 'labels', 'values'], 'series'); text(series.name, 'series name', 100);
          if (!Array.isArray(series.labels) || !series.labels.length || series.labels.length > 24 ||
              !Array.isArray(series.values) || series.values.length !== series.labels.length) throw new Error('Expected 1..24 matching labels/values');
          series.labels.forEach(label => text(label, 'chart label', 80));
          series.values.forEach(value => number(value, el.chartType === 'pie' ? 0 : -1e12, 1e12, 'chart value'));
          if (el.chartType === 'pie' && !series.values.some(value => value > 0)) throw new Error('Pie chart needs a positive value');
          if (labels && JSON.stringify(labels) !== JSON.stringify(series.labels)) throw new Error('All series must share labels');
          labels = series.labels;
        }
      } else {
        choice(el.shape, ['rect', 'roundRect', 'ellipse'], 'shape');
        if (!el.shape) throw new Error('shape is required');
        color(el.fill); color(el.lineColor);
      }
    }
  }
  return spec;
}
