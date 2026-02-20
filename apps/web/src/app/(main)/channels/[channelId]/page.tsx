'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/stores/chat'
import { MessageList } from '@/components/chat/MessageList'
import { MessageComposer } from '@/components/chat/MessageComposer'
import { ThreadPanel } from '@/components/chat/ThreadPanel'

export default function ChannelPage() {
  const params = useParams<{ channelId: string }>()
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const activeThreadId = useChatStore((s) => s.activeThreadId)

  useEffect(() => {
    if (params.channelId) {
      setActiveChannel(params.channelId)
    }
    return () => {
      setActiveChannel(null)
    }
  }, [params.channelId, setActiveChannel])

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1 min-w-0">
        <MessageList />
        <MessageComposer />
      </div>
      {activeThreadId && <ThreadPanel />}
    </div>
  )
}
