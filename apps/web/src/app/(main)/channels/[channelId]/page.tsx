'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/stores/chat'
import { MessageList } from '@/components/chat/MessageList'
import { MessageComposer } from '@/components/chat/MessageComposer'

export default function ChannelPage() {
  const params = useParams<{ channelId: string }>()
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)

  useEffect(() => {
    if (params.channelId) {
      setActiveChannel(params.channelId)
    }
  }, [params.channelId, setActiveChannel])

  return (
    <div className="flex flex-col h-full">
      <MessageList />
      <MessageComposer />
    </div>
  )
}
