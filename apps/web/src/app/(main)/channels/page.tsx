'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore, type Channel } from '@/stores/chat'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'

type FilterTab = 'my' | 'browse'

export default function ChannelsPage() {
  const router = useRouter()
  const channels = useChatStore((s) => s.channels)
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const joinChannel = useChatStore((s) => s.joinChannel)
  const fetchChannels = useChatStore((s) => s.fetchChannels)

  const [filter, setFilter] = useState<FilterTab>('my')
  const [search, setSearch] = useState('')
  const [allChannels, setAllChannels] = useState<Channel[]>([])
  const [isLoadingAll, setIsLoadingAll] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  // Fetch all public channels when switching to browse tab
  useEffect(() => {
    if (filter === 'browse' && allChannels.length === 0) {
      setIsLoadingAll(true)
      api<{ data: Channel[]; channels: Channel[] }>('/api/channels')
        .then((data) => {
          setAllChannels(data.data ?? data.channels ?? [])
        })
        .catch(() => {
          // Silently fail
        })
        .finally(() => setIsLoadingAll(false))
    }
  }, [filter, allChannels.length])

  const myChannelIds = useMemo(() => new Set(channels.map((c) => c.id)), [channels])

  const displayedChannels = useMemo(() => {
    const source = filter === 'my' ? channels : allChannels
    if (!search.trim()) return source
    const q = search.toLowerCase()
    return source.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        (ch.topic && ch.topic.toLowerCase().includes(q)),
    )
  }, [filter, channels, allChannels, search])

  // Channels the user has NOT joined (only relevant in browse mode)
  const notJoinedChannels = useMemo(() => {
    if (filter !== 'browse') return []
    return displayedChannels.filter((ch) => !myChannelIds.has(ch.id))
  }, [filter, displayedChannels, myChannelIds])

  const joinedChannels = useMemo(() => {
    if (filter !== 'browse') return displayedChannels
    return displayedChannels.filter((ch) => myChannelIds.has(ch.id))
  }, [filter, displayedChannels, myChannelIds])

  const handleJoin = async (channelId: string) => {
    setJoiningId(channelId)
    try {
      await joinChannel(channelId)
      await fetchChannels()
    } catch {
      // Silently fail
    } finally {
      setJoiningId(null)
    }
  }

  const handleOpenChannel = (channelId: string) => {
    setActiveChannel(channelId)
    router.push(`/channels/${channelId}`)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header area */}
      <div className="px-6 py-5 border-b border-smoke-600 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-smoke-100">Channels</h2>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-smoke-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setFilter('my')}
            aria-pressed={filter === 'my'}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === 'my'
                ? 'bg-smoke-700 text-smoke-100'
                : 'text-smoke-400 hover:text-smoke-200'
            }`}
          >
            My Channels
          </button>
          <button
            onClick={() => setFilter('browse')}
            aria-pressed={filter === 'browse'}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === 'browse'
                ? 'bg-smoke-700 text-smoke-100'
                : 'text-smoke-400 hover:text-smoke-200'
            }`}
          >
            Browse All
          </button>
        </div>

        <Input
          placeholder="Search channels..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search channels"
        />
      </div>

      {/* Channel list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {filter === 'browse' && isLoadingAll && (
          <div className="text-center py-8 text-smoke-400">Loading channels...</div>
        )}

        {/* Not joined section (browse mode) */}
        {filter === 'browse' && notJoinedChannels.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-smoke-400 mb-2">
              Channels you can join
            </h3>
            <div className="space-y-1">
              {notJoinedChannels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  isJoined={false}
                  isJoining={joiningId === ch.id}
                  onJoin={() => handleJoin(ch.id)}
                  onOpen={() => {}}
                />
              ))}
            </div>
          </div>
        )}

        {/* Joined channels */}
        {joinedChannels.length > 0 && (
          <div>
            {filter === 'browse' && notJoinedChannels.length > 0 && (
              <h3 className="text-xs font-semibold uppercase tracking-wider text-smoke-400 mb-2">
                Channels you have joined
              </h3>
            )}
            <div className="space-y-1">
              {joinedChannels.map((ch) => (
                <ChannelCard
                  key={ch.id}
                  channel={ch}
                  isJoined
                  isJoining={false}
                  onJoin={() => {}}
                  onOpen={() => handleOpenChannel(ch.id)}
                />
              ))}
            </div>
          </div>
        )}

        {displayedChannels.length === 0 && !isLoadingAll && (
          <div className="text-center py-12 text-smoke-400">
            <p className="text-lg font-medium text-smoke-300">No channels found</p>
            <p className="mt-1">
              {filter === 'my'
                ? 'You have not joined any channels yet. Try browsing all channels.'
                : 'No channels match your search.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// -- Channel Card Sub-component --

interface ChannelCardProps {
  channel: Channel
  isJoined: boolean
  isJoining: boolean
  onJoin: () => void
  onOpen: () => void
}

function ChannelCard({ channel, isJoined, isJoining, onJoin, onOpen }: ChannelCardProps) {
  return (
    <div
      onClick={isJoined ? onOpen : undefined}
      className={`flex items-center justify-between px-4 py-3 rounded-lg border border-smoke-600 bg-smoke-800 transition-colors ${
        isJoined ? 'cursor-pointer hover:bg-smoke-700' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-smoke-400">#</span>
          <span className="text-sm font-medium text-smoke-100 truncate">
            {channel.name}
          </span>
          {channel.type === 'private' && (
            <Badge variant="default">Private</Badge>
          )}
          {channel.isArchived && (
            <Badge variant="warning">Archived</Badge>
          )}
        </div>
        {channel.topic && (
          <p className="text-xs text-smoke-400 mt-0.5 truncate pl-5">
            {channel.topic}
          </p>
        )}
        {channel.memberCount !== undefined && channel.memberCount > 0 && (
          <span className="text-xs text-smoke-500 pl-5">
            {channel.memberCount} member{channel.memberCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {!isJoined && (
        <Button
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onJoin()
          }}
          isLoading={isJoining}
        >
          Join
        </Button>
      )}
    </div>
  )
}
