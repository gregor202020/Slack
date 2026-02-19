'use client'

import { Avatar } from '@/components/ui/Avatar'

interface Message {
  id: string
  body: string
  userId: string
  createdAt: string
  updatedAt: string
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({ message }: { message: Message }) {
  const isEdited = message.updatedAt !== message.createdAt

  return (
    <div className="group flex items-start gap-3 px-2 py-1.5 rounded-md hover:bg-smoke-800 transition-colors">
      <Avatar name={message.userId.slice(0, 8)} size="md" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-smoke-100">
            {message.userId.slice(0, 8)}
          </span>
          <span className="text-xs text-smoke-400">
            {formatTime(message.createdAt)}
          </span>
          {isEdited && (
            <span className="text-xs text-smoke-500">(edited)</span>
          )}
        </div>
        <p className="text-sm text-smoke-200 whitespace-pre-wrap break-words">
          {message.body}
        </p>
      </div>
    </div>
  )
}
