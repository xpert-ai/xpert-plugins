import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod/v3";
import type { itemSchema } from "./ui-common";

type Item = z.infer<typeof itemSchema>;
type Entry = { item: Item; leaving: boolean; top?: number };
const duration = 180;

/** Retain keyed rows during refresh; only changed positions and membership animate. */
export function useMeetingListTransition(items: Item[]) {
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, { top: number; rowTop: number }>());
  const animations = useRef(new Map<string, Animation>());
  const mounted = useRef(false);
  const [source, setSource] = useState(items);
  const [entries, setEntries] = useState<Entry[]>(() => items.map(item => ({ item, leaving: false })));
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Reconcile before commit so stable IDs keep their DOM nodes, focus and content.
  if (source !== items) {
    setSource(items);
    const ids = new Set(items.map(item => item.id));
    setEntries([
      ...items.map(item => ({ item, leaving: false })),
      ...(!reducedMotion ? entries.filter(entry => !ids.has(entry.item.id)).map(entry => ({
        ...entry, leaving: true, top: entry.top ?? positions.current.get(entry.item.id)?.rowTop,
      })) : []),
    ]);
  }

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    const nextPositions = new Map<string, { top: number; rowTop: number }>();
    for (const entry of entries) {
      const element = root.current?.querySelector<HTMLElement>(`[data-meeting-id="${entry.item.id}"]`);
      if (!element) continue;
      const id = entry.item.id, previous = positions.current.get(id);
      const running = animations.current.get(id);
      if (entry.leaving && running?.id === "meeting-leave" && !reducedMotion) continue;
      const offset = running ? new DOMMatrixReadOnly(getComputedStyle(element).transform).m42 : 0;
      running?.cancel();
      animations.current.delete(id);
      if (!entry.leaving) {
        const row = element.querySelector<HTMLElement>(".meeting-row");
        const rowOffset = row ? row.getBoundingClientRect().top - element.getBoundingClientRect().top : 0;
        nextPositions.set(id, { top: element.offsetTop, rowTop: element.offsetTop + rowOffset });
      }
      if (reducedMotion || !mounted.current) continue;
      let frames: Keyframe[];
      if (entry.leaving) frames = [{ opacity: 1 }, { opacity: 0, transform: "translateY(-4px)" }];
      else if (previous === undefined) frames = [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }];
      else {
        const distance = previous.top + offset - element.offsetTop;
        if (Math.abs(distance) < 0.5) continue;
        frames = [{ transform: `translateY(${distance}px)` }, { transform: "translateY(0)" }];
      }
      const animation = element.animate(frames, { duration, easing: "ease-out" });
      animation.id = entry.leaving ? "meeting-leave" : "meeting-move";
      animations.current.set(id, animation);
      void animation.finished.then(() => {
        if (animations.current.get(id) !== animation) return;
        animations.current.delete(id);
        if (entry.leaving) setEntries(current => current.filter(row => row.item.id !== id || !row.leaving));
      }, () => { /* Superseded update or unmount cancels this animation. */ });
    }
    positions.current = nextPositions;
    mounted.current = true;
    if (reducedMotion && entries.some(entry => entry.leaving))
      setEntries(current => current.filter(entry => !entry.leaving));
  }, [entries, reducedMotion]);

  useEffect(() => () => {
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
  }, []);

  return { root, entries };
}
