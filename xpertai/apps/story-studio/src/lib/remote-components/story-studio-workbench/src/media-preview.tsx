import * as React from 'react'
import type { Candidate } from './production-data'
import { primeVideoPreview } from './director-storyboard-media'

const h: typeof React.createElement = React.createElement

export function MediaPreview(props: {
  candidate: Candidate | null
  controls?: boolean
  posterUrl?: string | null
}) {
  const { candidate, controls = false } = props
  if (!candidate?.fileUrl) {
    return (
      <div className="ss-media-placeholder" aria-hidden="true">
        <span>SS</span>
      </div>
    )
  }
  if (candidate.kind === 'video') {
    return (
      <video
        className="ss-media-preview"
        controls={controls}
        crossOrigin="use-credentials"
        playsInline
        poster={props.posterUrl ?? undefined}
        preload="metadata"
        src={candidate.fileUrl}
        onLoadedMetadata={(event) => primeVideoPreview(event.currentTarget)}
        onLoadedData={(event) => primeVideoPreview(event.currentTarget)}
      >
        <track kind="captions" />
      </video>
    )
  }
  return (
    <img
      className="ss-media-preview"
      crossOrigin="use-credentials"
      src={candidate.fileUrl}
      alt={candidate.label}
    />
  )
}
