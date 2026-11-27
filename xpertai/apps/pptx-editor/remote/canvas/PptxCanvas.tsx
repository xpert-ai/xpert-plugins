import * as React from 'react';
import { Button } from '@xpert-ai/plugin-shadcn-ui';
import type { PptxDeck, PptxShape, PptxSlide } from '../../src/core/pptx-file.utils';
import {
  pptxShapeStyle,
  pptxSlideBackground,
  pptxSelectionFrameStyle,
} from '../../src/core/pptx-editor-view.utils';
import { PptxShapeContent } from './PptxShapeContent';
import { PptxTextEditor } from './PptxTextEditor';
import {
  resizeShape,
  type ShapeBounds,
  type ResizeCorner,
} from '../../src/core/pptx-gestures';
import { usePptxTranslation } from '../i18n';

type Gesture = {
  shape: PptxShape;
  corner?: ResizeCorner;
  startX: number;
  startY: number;
  scaleX: number;
  scaleY: number;
};
type PptxCanvasProps = {
  deck: PptxDeck;
  slide: PptxSlide;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onTransform?: (id: string, bounds: ShapeBounds) => void;
  onText?: (id: string, text: string) => void;
  onTextEnd?: () => void;
};

export function PptxCanvas(props: PptxCanvasProps) {
  // Reset slide-local interaction state before input, never in a mount effect.
  return <SlideCanvas key={props.slide.path} {...props} />;
}

function SlideCanvas({
  deck,
  slide,
  selected,
  onSelect,
  onTransform,
  onText,
  onTextEnd,
}: PptxCanvasProps) {
  const { t } = usePptxTranslation();
  const canvas = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<Gesture | null>(null);
  const [preview, setPreview] = React.useState<
    (ShapeBounds & { id: string }) | null
  >(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  function finishText() {
    setEditing(null);
    onTextEnd?.();
  }
  function bounds(event: React.PointerEvent): ShapeBounds | null {
    const g = drag.current;
    if (!g) return null;
    const dx = (event.clientX - g.startX) * g.scaleX,
      dy = (event.clientY - g.startY) * g.scaleY;
    return g.corner
      ? resizeShape(g.shape, g.corner, dx, dy)
      : {
          x: Math.round(g.shape.x + dx),
          y: Math.round(g.shape.y + dy),
          width: g.shape.width,
          height: g.shape.height,
        };
  }
  function start(
    event: React.PointerEvent<HTMLElement>,
    shape: PptxShape,
    corner?: ResizeCorner,
  ) {
    if (event.button !== 0 || !shape.editable || !onSelect) return;
    event.stopPropagation();
    onSelect(shape.id);
    if (!onTransform || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    drag.current = {
      shape,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: deck.width / rect.width,
      scaleY: deck.height / rect.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  const active = slide.shapes.find(
    (s) => s.id === selected && s.editable && !s.deleted,
  );
  const frame =
    active && preview?.id === active.id ? { ...active, ...preview } : active;
  return (
    <div
      ref={canvas}
      className="relative w-full shadow-sm"
      style={{
        aspectRatio: `${deck.width} / ${deck.height}`,
        containerType: 'inline-size',
        background: pptxSlideBackground(slide),
      }}
      onPointerDown={() => onSelect?.(null)}
      onPointerMove={(event) => {
        const next = bounds(event);
        if (next && drag.current)
          setPreview({ ...next, id: drag.current.shape.id });
      }}
      onPointerUp={(event) => {
        const next = bounds(event),
          g = drag.current;
        if (
          next &&
          g &&
          Object.entries(next).some(
            ([key, value]) => value !== g.shape[key as keyof ShapeBounds],
          )
        )
          onTransform?.(g.shape.id, next);
        drag.current = null;
        setPreview(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
      }}
    >
      <div className="absolute inset-0 overflow-hidden">
        {slide.shapes
          .filter((s) => !s.deleted)
          .map((original) => {
            const shape =
              preview?.id === original.id
                ? { ...original, ...preview }
                : original;
            return (
              <div
                key={shape.id}
                role={onSelect && shape.editable && editing !== shape.id ? 'button' : undefined}
                tabIndex={onSelect && shape.editable && editing !== shape.id ? 0 : undefined}
                aria-label={shape.name}
                aria-pressed={
                  onSelect && shape.editable && editing !== shape.id ? selected === shape.id : undefined
                }
                className="absolute border-solid"
                style={{
                  ...pptxShapeStyle(shape, deck),
                  whiteSpace: shape.wrap ? 'pre-wrap' : 'pre',
                  cursor: editing === shape.id ? 'text' : onSelect && shape.editable ? 'move' : undefined,
                  touchAction: onSelect && editing !== shape.id ? 'none' : undefined,
                }}
                onPointerDown={(event) => start(event, shape)}
                onDoubleClick={(event) => {
                  if (shape.editable && shape.kind === 'shape' && onText) {
                    event.stopPropagation();
                    onSelect?.(shape.id);
                    setEditing(shape.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    shape.editable &&
                    onText &&
                    shape.kind === 'shape'
                  ) {
                    event.preventDefault();
                    onSelect?.(shape.id);
                    setEditing(shape.id);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    onSelect?.(shape.id);
                  }
                }}
              >
                {editing === shape.id && onText ? (
                  <PptxTextEditor
                    shape={shape}
                    deck={deck}
                    label={t('workbench.files.text')}
                    onText={(text) => onText(shape.id, text)}
                    onEnd={finishText}
                  />
                ) : <PptxShapeContent shape={shape} deck={deck} />}
              </div>
            );
          })}
      </div>
      {active && frame && onTransform && !editing && (
        <div
          className="pointer-events-none absolute border-2 border-ring"
          style={pptxSelectionFrameStyle(frame, deck)}
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <Button
              key={corner}
              type="button"
              variant="outline"
              size="icon"
              aria-label={`${t('workbench.office.resize')} ${corner}`}
              className="pointer-events-auto absolute h-3 w-3"
              style={{
                left: corner.endsWith('w') ? 0 : '100%',
                top: corner.startsWith('n') ? 0 : '100%',
                transform: 'translate(-50%, -50%)',
                cursor: `${corner}-resize`,
                touchAction: 'none',
              }}
              onPointerDown={(event) => start(event, active, corner)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
