/** Longest edge kept after downsizing; enough for a model to read a scene, small enough to upload fast. */
const MAX_EDGE = 1280
const JPEG_QUALITY = 0.85
/** Refuse very large originals before decoding them in the browser. */
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024

/**
 * Decodes a picked image and re-encodes it as a JPEG `data:` URL no larger than MAX_EDGE.
 * Rejects when the browser cannot decode the file (for example HEIC in most browsers).
 */
export async function downscalePhoto(file: File): Promise<string> {
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error('photo_too_large')
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas_unavailable')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    bitmap.close()
  }
}
