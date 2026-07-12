export function canExport(): boolean
export function exportMp4(
  comp: {
    fps?: number
    w?: number
    h?: number
    duration(): number
    preload?(): Promise<void>
    seekMedia?(time: number): Promise<void>
    renderFrame(ctx: CanvasRenderingContext2D, time: number): void
  },
  opts?: {
    fps?: number
    bitrate?: number
    scale?: number
  },
  onProgress?: (progress: number) => void
): Promise<Blob>
