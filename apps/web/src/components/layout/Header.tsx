'use client'

import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { Button } from '@/components/ui/Button'

export function Header() {
  const logout = useAuthStore((s) => s.logout)
  const channels = useChatStore((s) => s.channels)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const activeDmId = useChatStore((s) => s.activeDmId)

  const activeChannel = channels.find((c) => c.id === activeChannelId)

  return (
    <header className="flex items-center justify-between h-14 px-4 border-b border-smoke-600 bg-smoke-900 shrink-0">
      <div className="flex items-center gap-3">
        {activeChannel ? (
          <>
            <h1 className="text-base font-semibold text-smoke-100">
              # {activeChannel.name}
            </h1>
            {activeChannel.topic && (
              <span className="text-sm text-smoke-400 truncate max-w-md">
                {activeChannel.topic}
              </span>
            )}
          </>
        ) : activeDmId ? (
          <h1 className="text-base font-semibold text-smoke-100">Direct Message</h1>
        ) : (
          <h1 className="text-base font-semibold text-smoke-100">The Smoker</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={logout}>
          Sign out
        </Button>
      </div>
    </header>
  )
}
