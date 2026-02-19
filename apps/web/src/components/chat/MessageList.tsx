'use client'

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/stores/chat'
import { MessageBubble } from './MessageBubble'
import { Spinner } from '@/components/ui/Spinner'

export function MessageList() {
  const messages = useChatStore((s) => s.messages)
  const isLoading = useChatStore((s) => s.isLoadingMessages)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-smoke-400">
        <p>No messages yet. Break the ice.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
