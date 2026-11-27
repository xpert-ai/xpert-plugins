import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PptxCanvas } from '../remote/canvas/PptxCanvas';
import { readPptxEditableText } from '../remote/canvas/PptxTextEditor';
import { createTextBoxShape, paragraphsForShapeText } from '../src/core/pptx-editor-model.utils';
import type { PptxDeck } from '../src/core/pptx-types';
import { parsePptx, savePptx } from '../src/core/pptx-file.utils';

jest.mock('@xpert-ai/plugin-shadcn-ui', () => ({
  Button: ({ children, ...props }: any) => React.createElement('button', props, children),
}));
jest.mock('../remote/i18n', () => ({ usePptxTranslation: () => ({ t: (key: string) => key }) }));

let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

function fixture() {
  const deck: PptxDeck = { width: 12192000, height: 6858000, slides: [] };
  const shape = createTextBoxShape(deck);
  Object.assign(shape, {
    name: '标题', text: '客户想把现场联调加入本期交付', fontSizePt: 36,
    bold: true, textColor: '#17323a', fill: '#f4f1e9', verticalAlign: 'middle',
    fontScale: .85, rotation: 12, wrap: false,
    margin: { left: 0, right: 0, top: 0, bottom: 0 },
  });
  shape.paragraphs = paragraphsForShapeText(shape, shape.text);
  shape.paragraphs[0].spaceAfterPt = 4;
  shape.paragraphs[0].lineHeight = 1.3;
  deck.slides.push({ path: 'ppt/slides/slide1.xml', xml: '', shapes: [shape], background: '#fff' });
  return { deck, shape };
}

function mount(deck: PptxDeck, onText = jest.fn(), onEnd = jest.fn()) {
  function Harness() {
    const [state, setState] = React.useState(deck);
    const [selected, select] = React.useState<string | null>(null);
    return React.createElement(PptxCanvas, {
      deck: state, slide: state.slides[0], selected, onSelect: select, onTransform: jest.fn(),
      onText: (id, text) => {
        onText(id, text);
        setState(previous => {
          const next = structuredClone(previous), shape = next.slides[0].shapes.find(s => s.id === id)!;
          shape.text = text; shape.paragraphs = paragraphsForShapeText(shape, text);
          return next;
        });
      }, onTextEnd: onEnd,
    });
  }
  act(() => root.render(React.createElement(Harness)));
  return { onText, onEnd };
}

function enter() {
  act(() => container.querySelector('[aria-label="标题"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

it('reuses the exact text layout once, preserving the shape background and transforms while editing', () => {
  const { deck, shape } = fixture();
  mount(deck);
  const displayed = container.querySelector('[aria-label="标题"]') as HTMLDivElement;
  const originalContent = displayed.innerHTML, originalTextContent = displayed.firstElementChild!.innerHTML,
    originalStyle = displayed.style.cssText;
  const editor = enter();
  expect(editor).not.toBeNull();
  expect(editor.innerHTML).toBe(originalTextContent);
  expect(container.textContent).toBe(shape.text);
  expect(container.querySelectorAll('textarea')).toHaveLength(0);
  expect(displayed.style.background).toBe('rgb(244, 241, 233)');
  expect(displayed.style.transform).toBe('rotate(12deg)');
  expect(displayed.style.cssText.replace('cursor: text', 'cursor: move')).toBe(originalStyle);
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(container.querySelector('[role="textbox"]')).toBeNull();
  expect(displayed.innerHTML).toBe(originalContent);
});

it('keeps browser-owned text and selection through model updates and ignores IME confirmation keys', () => {
  const { deck, shape } = fixture();
  const { onText, onEnd } = mount(deck);
  const editor = enter(), paragraph = editor.querySelector('p')!;
  const textNode = paragraph.querySelector('span')!.firstChild!;
  textNode.textContent = '客户追加联调';
  const range = document.createRange();
  range.setStart(textNode, 2); range.collapse(true);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  act(() => editor.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true })));
  expect(onText).toHaveBeenLastCalledWith(shape.id, '客户追加联调');
  expect(editor.querySelector('p')).toBe(paragraph);
  expect(window.getSelection()!.anchorNode).toBe(textNode);
  expect(window.getSelection()!.anchorOffset).toBe(2);
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true })));
  expect(onEnd).not.toHaveBeenCalled();
  act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })));
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="textbox"]')).toBeNull();
  expect(container.querySelector('[aria-label="标题"]')!.textContent).toBe('客户追加联调');
});

it.each([
  ['<div><p>第一行</p><p>第二行</p></div>', '第一行\n第二行'],
  ['<div>第一行<div><br></div><div>第三行<br></div></div>', '第一行\n\n第三行'],
  ['<div><p><span data-pptx-bullet>• </span>项目</p><p><br></p></div>', '项目\n'],
  ['<div><p>第一行<br>第二行<br></p></div>', '第一行\n第二行'],
  ['<div><br></div>', ''],
])('reads editable text without losing paragraph breaks: %s', (html, expected) => {
  container.innerHTML = html;
  expect(readPptxEditableText(container)).toBe(expected);
});

it('round-trips a title edited on the canvas with its authored formatting', async () => {
  const Presentation = require('pptxgenjs'), pptx = new Presentation();
  pptx.addSlide().addText('客户想把现场联调加入本期交付', {
    x: 1, y: 1, w: 8, h: 1, fontSize: 36, bold: true, color: '17323A', margin: 0, valign: 'mid', objectName: '标题',
  });
  const source = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer;
  const deck = await parsePptx(source), shape = deck.slides[0].shapes[0];
  const original = { fontSizePt: shape.fontSizePt, bold: shape.bold, textColor: shape.textColor, verticalAlign: shape.verticalAlign, margin: shape.margin };
  mount(deck, jest.fn((id, text) => { shape.text = text; shape.paragraphs = paragraphsForShapeText(shape, text); }));
  const editor = enter();
  editor.querySelector('span')!.textContent = '客户确认加入现场联调';
  act(() => editor.dispatchEvent(new InputEvent('input', { bubbles: true })));
  act(() => editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  const reopened = await parsePptx(await savePptx(deck, source));
  expect(reopened.slides[0].shapes[0]).toMatchObject({ ...original, text: '客户确认加入现场联调' });
});
