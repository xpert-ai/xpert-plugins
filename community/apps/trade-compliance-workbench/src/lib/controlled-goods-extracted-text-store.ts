// @ts-nocheck

const controlledGoodsExtractedTextByBatch = new Map()

export function storeControlledGoodsExtractedText(batchId, payload) {
  if (!batchId) return
  controlledGoodsExtractedTextByBatch.set(batchId, {
    batchId,
    sourceFileName: payload?.sourceFileName,
    kind: payload?.kind,
    originalLength: payload?.originalLength ?? 0,
    chunks: Array.isArray(payload?.chunks) ? payload.chunks : []
  })
}

export function getControlledGoodsExtractedTextChunk(batchId, chunkIndex = 1) {
  const stored = controlledGoodsExtractedTextByBatch.get(batchId)
  if (!stored) {
    return {
      batchId,
      found: false,
      error: '未找到该批次的转换文本，请重新上传文件后再解析。'
    }
  }

  const safeIndex = Math.max(1, Math.floor(Number(chunkIndex) || 1))
  const chunkCount = stored.chunks.length
  const text = stored.chunks[safeIndex - 1] ?? ''
  return {
    batchId,
    found: Boolean(text),
    sourceFileName: stored.sourceFileName,
    kind: stored.kind,
    originalLength: stored.originalLength,
    chunkIndex: safeIndex,
    chunkCount,
    hasMore: safeIndex < chunkCount,
    nextChunkIndex: safeIndex < chunkCount ? safeIndex + 1 : undefined,
    text
  }
}
