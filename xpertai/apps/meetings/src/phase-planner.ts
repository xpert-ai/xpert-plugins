import type { Meeting } from "./domain.js";

/** The slowest contiguous source is the clock: missing uploads/ASR are never silence. */
export function silentBoundaries(
  segments: Meeting["transcript"],
  silenceMs: number
) {
  let watermark = Infinity;
  for (const track of ["microphone", "system"] as const) {
    let end = 0;
    for (const s of segments
      .filter((s) => s.track === track)
      .sort((a, b) => a.startMs - b.startMs)) {
      if (s.startMs > end + 100) break;
      end = Math.max(end, s.endMs);
    }
    watermark = Math.min(watermark, end);
  }
  const activity = segments
    .flatMap((s) => s.activity ?? [{ startMs: s.startMs, endMs: s.endMs }])
    .filter((a) => a.startMs < watermark)
    .sort((a, b) => a.startMs - b.startMs);
  const merged: { startMs: number; endMs: number }[] = [];
  for (const range of activity) {
    const last = merged.at(-1),
      endMs = Math.min(range.endMs, watermark);
    if (last && range.startMs <= last.endMs)
      last.endMs = Math.max(last.endMs, endMs);
    else merged.push({ startMs: range.startMs, endMs });
  }
  return merged.flatMap((range, i) => {
    const end = merged[i + 1]?.startMs ?? watermark;
    return end - range.endMs >= silenceMs ? [end] : [];
  });
}

export function quotedTranscript(segments: Meeting["transcript"]) {
  return segments
    .filter((s) => s.text.trim())
    .map((s) => {
      const source = s.track === "microphone" ? "麦克风" : "系统音频";
      return (
        `> [${s.id} · ${source} · ${(s.startMs / 1000).toFixed(1)}–${(
          s.endMs / 1000
        ).toFixed(1)}s]\n` +
        s.text
          .split(/\r?\n/)
          .map((line) => `> ${line}`)
          .join("\n")
      );
    })
    .join("\n>\n");
}
