'use client'

import { useMemo } from 'react'
import { clsx } from 'clsx'
import type { Reaction } from '@/stores/chat'

interface GroupedReaction {
  emoji: string
  count: number
  userIds: string[]
  hasCurrentUser: boolean
}

interface ReactionPillsProps {
  reactions: Reaction[]
  currentUserId: string | undefined
  onToggle: (emoji: string) => void
}

export function ReactionPills({ reactions, currentUserId, onToggle }: ReactionPillsProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedReaction>()
    for (const r of reactions) {
      const existing = map.get(r.emoji)
      if (existing) {
        existing.count++
        existing.userIds.push(r.userId)
        if (r.userId === currentUserId) existing.hasCurrentUser = true
      } else {
        map.set(r.emoji, {
          emoji: r.emoji,
          count: 1,
          userIds: [r.userId],
          hasCurrentUser: r.userId === currentUserId,
        })
      }
    }
    return Array.from(map.values())
  }, [reactions, currentUserId])

  if (grouped.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {grouped.map((group) => (
        <button
          key={group.emoji}
          onClick={() => onToggle(group.emoji)}
          className={clsx(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs border transition-colors cursor-pointer',
            group.hasCurrentUser
              ? 'bg-brand/20 border-brand/40 text-brand'
              : 'bg-smoke-700 border-smoke-600 text-smoke-300 hover:border-smoke-500',
          )}
        >
          <span className="leading-none">{group.emoji}</span>
          <span>{group.count}</span>
        </button>
      ))}
    </div>
  )
}
