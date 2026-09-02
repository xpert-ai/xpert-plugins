import * as React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '../../../ui/index'
import type { PipelineLane } from './types'

const h: typeof React.createElement = React.createElement

type AssistantIdentity = PipelineLane['assistant']

export function AssistantAvatar({ assistant, className }: {
  assistant: AssistantIdentity
  className?: string
}) {
  const glyph = avatarGlyph(assistant.avatar)
  return (
    <Avatar
      className={['foc-assistant-avatar', className].filter(Boolean).join(' ')}
      aria-label={assistant.displayName}
    >
      {assistant.avatar?.url && <AvatarImage src={assistant.avatar.url} alt={assistant.displayName} />}
      <AvatarFallback
        className="foc-avatar-fallback"
        style={{ background: assistant.avatar?.background ?? undefined }}
      >
        {glyph
          ? <span className="foc-avatar-glyph" aria-hidden="true">{glyph}</span>
          : assistant.avatarFallback}
      </AvatarFallback>
    </Avatar>
  )
}

function avatarGlyph(avatar: AssistantIdentity['avatar']) {
  const unified = avatar?.emoji?.unified
  if (unified) {
    try {
      return unified
        .split('-')
        .map((part) => String.fromCodePoint(Number.parseInt(part, 16)))
        .join('')
    } catch {
      // Continue to the literal glyph fallback.
    }
  }
  const id = avatar?.emoji?.id?.replace(/^:+|:+$/g, '')
  if (!id) return null
  return /[^\u0000-\u007f]/u.test(id) ? id : null
}
