import { captureStateSchema } from "../../../src/capture-contract";
import { command } from "./bridge";

type Runtime = "browser" | "desktop";
const commands = {
  desktop: { start: "desktop.audio.capture.start", stop: "desktop.audio.capture.stop", retry: "desktop.audio.capture.retry" },
  browser: { start: "browser.audio.capture.start", stop: "browser.audio.capture.stop", retry: "browser.audio.capture.retry" },
} as const;
export function captureCommand(operation: keyof typeof commands.desktop, payload: Record<string, unknown>, runtime: Runtime = "desktop") {
  return command(commands[runtime][operation], payload);
}
let runtime: Runtime | undefined;
export function resetCaptureRuntime() { runtime = undefined; }
export async function captureStatus() {
  if (runtime) return { ...captureStateSchema.parse(await command(runtime === "browser" ? "browser.audio.capture.state" : "desktop.audio.capture.state", {})), runtime };
  try {
    const state = captureStateSchema.parse(await command("desktop.audio.capture.state", {}));
    if (state.supported) { runtime = "desktop"; return { ...state, runtime }; }
  } catch (error) {
    if (!(error instanceof Error && ["unsupported", "desktop_required"].includes(error.message))) throw error;
  }
  const state = captureStateSchema.parse(await command("browser.audio.capture.state", {}));
  runtime = "browser";
  return { ...state, runtime };
}
