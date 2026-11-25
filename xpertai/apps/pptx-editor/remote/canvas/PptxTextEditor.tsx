import * as React from 'react';
import type { PptxDeck, PptxShape } from '../../src/core/pptx-file.utils';
import { PptxTextContent } from './PptxShapeContent';

/** Read browser-created paragraphs without serializing formatting or bullet markers. */
export function readPptxEditableText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && node.hasAttribute('data-pptx-bullet')) return '';
  const children = Array.from(node.childNodes);
  const isBlock = (child: Node) => child instanceof Element && /^(P|DIV)$/.test(child.tagName);
  return children.map((child, index) => {
    const separator = index > 0 && (isBlock(child) || isBlock(children[index - 1])) ? '\n' : '';
    // A final BR is the browser's caret placeholder, including in an empty paragraph.
    const text = child instanceof HTMLBRElement
      ? index === children.length - 1 ? '' : '\n'
      : readPptxEditableText(child);
    return separator + text;
  }).join('');
}

export function PptxTextEditor({ shape, deck, label, onText, onEnd }: {
  shape: PptxShape;
  deck: PptxDeck;
  label: string;
  onText(text: string): void;
  onEnd(): void;
}) {
  const root = React.useRef<HTMLDivElement>(null);
  const lastText = React.useRef(shape.text);
  // The browser owns this subtree while editing. Keeping the initial element stable
  // prevents model updates from replacing the selection or interrupting IME input.
  const [initial] = React.useState({ shape, deck });
  React.useEffect(() => {
    root.current?.focus();
  }, []);
  function publish() {
    if (!root.current) return;
    const text = readPptxEditableText(root.current);
    if (text !== lastText.current) {
      lastText.current = text;
      onText(text);
    }
  }
  return <PptxTextContent {...initial} editorProps={{
    ref: root,
    role: 'textbox',
    'aria-label': label,
    'aria-multiline': true,
    contentEditable: 'plaintext-only',
    suppressContentEditableWarning: true,
    style: { outline: '1px solid var(--ring)', outlineOffset: '-1px' },
    onPointerDown: (event) => event.stopPropagation(),
    onDoubleClick: (event) => event.stopPropagation(),
    onInput: publish,
    onCompositionEnd: publish,
    onBlur: () => { publish(); onEnd(); },
    onKeyDown: (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') return;
      event.stopPropagation();
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault();
        publish();
        onEnd();
      }
    },
  }} />;
}
