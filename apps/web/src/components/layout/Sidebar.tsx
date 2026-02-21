'use client'

import { useRouter, usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { Avatar } from '@/components/ui/Avatar'
import { ChannelSkeleton, DmSkeleton } from '@/components/ui/Skeleton'

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const channels = useChatStore((s) => s.channels)
  const dms = useChatStore((s) => s.dms)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const activeDmId = useChatStore((s) => s.activeDmId)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const setActiveDm = useChatStore((s) => s.setActiveDm)
  const unreadCounts = useChatStore((s) => s.unreadCounts)
  const user = useAuthStore((s) => s.user)

  const isAdmin = user?.orgRole === 'admin' || user?.orgRole === 'super_admin'
  const isChannelsLoading = channels.length === 0
  const isDmsLoading = dms.length === 0

  return (
    <aside className="flex flex-col w-64 bg-smoke-800 border-r border-smoke-600 h-full" role="complementary" aria-label="Sidebar navigation">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-smoke-600 shrink-0">
        <span className="text-lg font-bold tracking-wider text-smoke-100">THE SMOKER</span>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4" aria-label="Channel and direct message navigation">
        {/* Channels */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-smoke-400">
              Channels
            </span>
          </div>
          {isChannelsLoading ? (
            <>
              <ChannelSkeleton />
              <ChannelSkeleton />
              <ChannelSkeleton />
              <ChannelSkeleton />
              <ChannelSkeleton />
            </>
          ) : (
            channels.map((ch) => {
              const unread = unreadCounts[ch.id] ?? 0
              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    setActiveChannel(ch.id)
                    router.push(`/channels/${ch.id}`)
                  }}
                  aria-current={activeChannelId === ch.id ? 'page' : undefined}
                  aria-label={`Channel ${ch.name}${unread > 0 ? `, ${unread} unread messages` : ''}`}
                  className={clsx(
                    'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
                    activeChannelId === ch.id
                      ? 'bg-brand text-white'
                      : 'text-smoke-300 hover:bg-smoke-700 hover:text-smoke-100',
                  )}
                >
                  <span className="text-smoke-400">#</span>
                  <span className={clsx('truncate flex-1 text-left', unread > 0 && 'font-bold text-smoke-100')}>{ch.name}</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-brand text-white text-xs font-bold min-w-[20px] text-center px-1.5 py-0.5">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* DMs */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-smoke-400">
              Direct Messages
            </span>
          </div>
          {isDmsLoading ? (
            <>
              <DmSkeleton />
              <DmSkeleton />
              <DmSkeleton />
            </>
          ) : (
            dms.map((dm) => {
              const unread = unreadCounts[dm.id] ?? 0
              return (
                <button
                  key={dm.id}
                  onClick={() => {
                    setActiveDm(dm.id)
                    router.push(`/dms/${dm.id}`)
                  }}
                  aria-current={activeDmId === dm.id ? 'page' : undefined}
                  aria-label={`Direct message${unread > 0 ? `, ${unread} unread messages` : ''}`}
                  className={clsx(
                    'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
                    activeDmId === dm.id
                      ? 'bg-brand text-white'
                      : 'text-smoke-300 hover:bg-smoke-700 hover:text-smoke-100',
                  )}
                >
                  <Avatar name={`DM ${dm.id.slice(0, 4)}`} size="sm" />
                  <span className={clsx('truncate flex-1 text-left', unread > 0 && 'font-bold text-smoke-100')}>DM</span>
                  {unread > 0 && (
                    <span className="rounded-full bg-brand text-white text-xs font-bold min-w-[20px] text-center px-1.5 py-0.5">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-smoke-600 p-3 space-y-2 shrink-0">
        {isAdmin && (
          <button
            onClick={() => router.push('/admin/users')}
            aria-current={pathname.startsWith('/admin') ? 'page' : undefined}
            aria-label="Admin panel"
            className={clsx(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
              pathname.startsWith('/admin')
                ? 'bg-smoke-700 text-smoke-100'
                : 'text-smoke-400 hover:bg-smoke-700 hover:text-smoke-100',
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Admin</span>
          </button>
        )}

        {/* Settings link */}
        <button
          onClick={() => router.push('/settings')}
          aria-current={pathname === '/settings' ? 'page' : undefined}
          className={clsx(
            'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors',
            pathname === '/settings'
              ? 'bg-smoke-700 text-smoke-100'
              : 'text-smoke-400 hover:bg-smoke-700 hover:text-smoke-100',
          )}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>Settings</span>
        </button>

        {/* User info — click to go to profile */}
        {user && (
          <button
            onClick={() => router.push('/profile')}
            aria-current={pathname === '/profile' ? 'page' : undefined}
            aria-label={`Your profile: ${user.displayName || `${user.firstName} ${user.lastName}`}`}
            className={clsx(
              'flex items-center gap-2 w-full px-2 py-1.5 rounded-md transition-colors',
              pathname === '/profile'
                ? 'bg-smoke-700'
                : 'hover:bg-smoke-700',
            )}
          >
            <Avatar
              src={user.avatarUrl}
              name={user.displayName || `${user.firstName} ${user.lastName}`}
              size="sm"
              isOnline
            />
            <span className="text-sm text-smoke-200 truncate">
              {user.displayName || `${user.firstName} ${user.lastName}`}
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}
