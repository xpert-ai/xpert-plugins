import type { IconDefinition } from "@xpert-ai/contracts";
import { readFileSync } from "node:fs";

export const meetingsIcon = {
  type: "image",
  value: `data:image/png;base64,${readFileSync(
    new URL("../assets/brand/meetings-icon-v1.png", import.meta.url)
  ).toString("base64")}`,
  alt: "Meetings",
} satisfies IconDefinition;

export const meetingsScreenshots = [
  "./assets/brand/meetings-overview-zh-v1.png",
];
