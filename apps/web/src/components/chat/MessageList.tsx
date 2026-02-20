'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useChatStore } from '@/stores/chat'
import { MessageBubble } from './MessageBubble'
import { MessageSkeleton } from '@/components/ui/Skeleton'

const NEAR_BOTTOM_THRESHOLD = 150

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoadingMessages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevMessageCountRef = useRef(0)

  // Filter out thread replies — only show top-level messages
  const topLevelMessages = useMemo(
    () => messages.filter((m) => !m.parentMessageId),
    [messages],
  )

  useEffect(() => {
    const isNewMessage = topLevelMessages.length > prevMessageCountRef.current
    prevMessageCountRef.current = topLevelMessages.length

    if (!isNewMessage) return

    const container = containerRef.current
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_THRESHOLD
      if (!isNearBottom) return
    }

    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [topLevelMessages])

  if (isLoading) {
    return (
      <div className="flex-1 overflow-hidden px-4 py-2 space-y-1">
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
        <MessageSkeleton />
      </div>
    )
  }

  if (topLevelMessages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-smoke-400">
        <p>No messages yet. Break the ice.</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
      {topLevelMessages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
