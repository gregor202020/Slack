'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useChatStore } from '@/stores/chat'
import { MessageList } from '@/components/chat/MessageList'
import { MessageComposer } from '@/components/chat/MessageComposer'

export default function DmPage() {
  const params = useParams<{ dmId: string }>()
  const setActiveDm = useChatStore((s) => s.setActiveDm)

  useEffect(() => {
    if (params.dmId) {
      setActiveDm(params.dmId)
    }
  }, [params.dmId, setActiveDm])

  return (
    <div className="flex flex-col h-full">
      <MessageList />
      <MessageComposer />
    </div>
  )
}
