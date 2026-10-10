import { MeetingError } from "./domain.js";

export const SAMPLE_RATE = 24000;
export function pcmFromWav(buffer: Buffer) {
  if (
    buffer.length < 44 ||
    buffer.length > 400000 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE" ||
    buffer.toString("ascii", 12, 16) !== "fmt " ||
    buffer.readUInt32LE(16) !== 16 ||
    buffer.readUInt16LE(20) !== 1 ||
    buffer.readUInt16LE(22) !== 1 ||
    buffer.readUInt32LE(24) !== SAMPLE_RATE ||
    buffer.readUInt16LE(34) !== 16 ||
    buffer.toString("ascii", 36, 40) !== "data" ||
    buffer.readUInt32LE(40) !== buffer.length - 44 ||
    buffer.readUInt32LE(4) !== buffer.length - 8 ||
    buffer.length % 2
  )
    throw new MeetingError("invalid_audio");
  return buffer.subarray(44);
}
export function wav(pcm: Buffer) {
  const h = Buffer.alloc(44);
  h.write("RIFF");
  h.writeUInt32LE(pcm.length + 36, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SAMPLE_RATE, 24);
  h.writeUInt32LE(SAMPLE_RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** 20 ms PCM energy intervals. This detects sound, not speakers or semantic speech. */
export function audioActivity(pcm: Buffer, startMs: number, thresholdDb = -50) {
  const intervals: { startMs: number; endMs: number }[] = [];
  const frameSamples = Math.round(SAMPLE_RATE * 0.02),
    threshold = 10 ** (thresholdDb / 20);
  for (let offset = 0; offset < pcm.length / 2; offset += frameSamples) {
    const end = Math.min(offset + frameSamples, pcm.length / 2);
    let energy = 0;
    for (let i = offset; i < end; i++)
      energy += (pcm.readInt16LE(i * 2) / 32768) ** 2;
    if (Math.sqrt(energy / (end - offset)) < threshold) continue;
    const begin = startMs + (offset / SAMPLE_RATE) * 1000,
      finish = startMs + (end / SAMPLE_RATE) * 1000;
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous.endMs - begin) < 0.01)
      previous.endMs = finish;
    else intervals.push({ startMs: begin, endMs: finish });
  }
  return intervals;
}
