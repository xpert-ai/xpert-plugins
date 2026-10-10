import React from "react";
import { z } from "zod/v3";
import { meetingSchema, type MeetingDto } from "../../../src/domain";
import type { Key } from "./i18n";
export const dto = meetingSchema.omit({ scope: true, deleted: true });
export const itemSchema = dto
  .pick({
    id: true,
    title: true,
    createdAt: true,
    startedAt: true,
    durationMs: true,
    capture: true,
    processing: true,
    errorCode: true,
  })
  .extend({ preview: z.string() });
export const listSchema = z.object({
  items: z.array(itemSchema),
  total: z.number(),
  page: z.number().optional(),
});
export { captureStateSchema as captureSchema } from "../../../src/capture-contract";
import { captureStateSchema } from "../../../src/capture-contract";
// This association is resolved by the plugin, never inferred by Desktop or ChatKit.
export type Capture = z.infer<typeof captureStateSchema> & {
  meetingId?: string;
};
export type T = (key: Key) => string;
export const idle: Capture = {
  supported: false,
  status: "idle",
  elapsedMs: 0,
  microphone: 0,
  system: 0,
  pendingCount: 0,
};
export const time = (ms: number) =>
  `${Math.floor(ms / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")}`;
export function date(value: string, locale?: string) {
  return new Intl.DateTimeFormat(locale?.replace("_", "-") ?? "zh-Hans", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
export function Status({
  meeting,
  capture,
  t,
}: {
  meeting: Pick<MeetingDto, "id" | "capture" | "processing">;
  capture?: Capture;
  t: T;
}) {
  const key =
    capture?.meetingId === meeting.id && capture.status !== "idle"
      ? capture.status
      : meeting.processing === "not_started"
      ? meeting.capture
      : meeting.processing;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 text-xs ${
        key === "ready"
          ? "text-emerald-600 dark:text-emerald-400"
          : key === "failed"
          ? "text-destructive"
          : "text-muted-foreground"
      }`}
    >
      <i className="size-1.5 rounded-full bg-current" />
      {t(key)}
    </span>
  );
}
