import * as React from 'react'
import { ImageSquare } from '@phosphor-icons/react'
import { requestFileAccess } from './bridge.js'
import type { JsonObject, JsonValue } from './types.js'

export function ReferencePreview(props: {
  fileKey: string
  projectId: string
  previewUrl?: string | null
  alt: string
  unavailableLabel: string
}) {
  const [url, setUrl] = React.useState<string | null>(props.previewUrl ?? null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let active = true
    setFailed(false)
    if (props.previewUrl) {
      setUrl(props.previewUrl)
      return () => {
        active = false
      }
    }
    setUrl(null)
    void requestFileAccess({
      fileKey: props.fileKey,
      targetId: props.projectId,
      purpose: 'preview'
    }).then((response) => {
      const result = object(response.result)
      const nextUrl = typeof result?.url === 'string' ? result.url : null
      if (!active) return
      if (nextUrl) setUrl(nextUrl)
      else setFailed(true)
    }).catch(() => {
      if (active) setFailed(true)
    })
    return () => {
      active = false
    }
  }, [props.fileKey, props.previewUrl, props.projectId])

  if (!url || failed) {
    return (
      <div className="reference-image-fallback" aria-label={props.unavailableLabel}>
        <ImageSquare size={28} weight="duotone" aria-hidden="true" />
      </div>
    )
  }
  return <img className="reference-image" src={url} alt={props.alt} onError={() => setFailed(true)} />
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}
