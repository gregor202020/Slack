'use client'

import { useState, useMemo } from 'react'
import { useChatStore, type ChannelMember } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface MemberListProps {
  channelId: string
  onAddMembers: () => void
}

export function MemberList({ channelId, onAddMembers }: MemberListProps) {
  const members = useChatStore((s) => s.channelMembers[channelId] ?? [])
  const removeChannelMember = useChatStore((s) => s.removeChannelMember)
  const user = useAuthStore((s) => s.user)
  const [search, setSearch] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)

  const isAdmin = user?.orgRole === 'admin' || user?.orgRole === 'super_admin'

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members
    const q = search.toLowerCase()
    return members.filter((m) =>
      m.fullName.toLowerCase().includes(q),
    )
  }, [members, search])

  const handleRemove = async (userId: string) => {
    setRemovingId(userId)
    try {
      await removeChannelMember(channelId, userId)
    } catch {
      // Silently fail
    } finally {
      setRemovingId(null)
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Badge variant="error">Super Admin</Badge>
      case 'admin':
        return <Badge variant="warning">Admin</Badge>
      case 'mid':
        return <Badge variant="info">Mid</Badge>
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-smoke-200">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </span>
        <Button variant="secondary" size="sm" onClick={onAddMembers}>
          Add members
        </Button>
      </div>

      <Input
        placeholder="Search members..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="max-h-64 overflow-y-auto space-y-1">
        {filteredMembers.map((member) => (
          <div
            key={member.userId}
            className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-smoke-700 transition-colors"
          >
            <Avatar
              src={member.avatarUrl}
              name={member.fullName}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-smoke-100 truncate">
                  {member.fullName}
                </span>
                {getRoleBadge(member.orgRole)}
                {member.userId === user?.id && (
                  <span className="text-xs text-smoke-400">(you)</span>
                )}
              </div>
            </div>
            {isAdmin && member.userId !== user?.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(member.userId)}
                isLoading={removingId === member.userId}
                className="text-smoke-400 hover:text-error"
              >
                Remove
              </Button>
            )}
          </div>
        ))}

        {filteredMembers.length === 0 && (
          <p className="text-center text-sm text-smoke-400 py-4">
            No members found
          </p>
        )}
      </div>
    </div>
  )
}
