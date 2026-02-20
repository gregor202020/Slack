'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/stores/chat'
import { MessageList } from '@/components/chat/MessageList'
import { MessageComposer } from '@/components/chat/MessageComposer'
import { ThreadPanel } from '@/components/chat/ThreadPanel'

export default function DmPage() {
  const params = useParams<{ dmId: string }>()
  const setActiveDm = useChatStore((s) => s.setActiveDm)
  const activeThreadId = useChatStore((s) => s.activeThreadId)

  useEffect(() => {
    if (params.dmId) {
      setActiveDm(params.dmId)
    }
  }, [params.dmId, setActiveDm])

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
