import { readFileSync } from "node:fs";
import type { TAvatar } from "@xpert-ai/contracts";
import type { Role } from "./definition.js";

/** Packaged portraits travel with the template; the host owns installed URLs. */
export function roleAvatar(role: Role): TAvatar {
  const portrait = readFileSync(
    new URL(`../assets/avatars/${role}-v1.jpg`, import.meta.url),
  );
  return {
    url: `data:image/jpeg;base64,${portrait.toString("base64")}`,
    background: "#F3EEE4",
  };
}
