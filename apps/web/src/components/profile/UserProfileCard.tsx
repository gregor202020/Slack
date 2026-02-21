'use client'

import { Avatar } from '@/components/ui/Avatar'

interface UserProfileCardProps {
  avatarUrl?: string | null
  displayName?: string | null
  fullName: string
  orgRole: string
  bio?: string | null
  status?: string
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  basic: 'Team Member',
}

export function UserProfileCard({
  avatarUrl,
  displayName,
  fullName,
  orgRole,
  bio,
  status,
}: UserProfileCardProps) {
  const name = displayName || fullName

  return (
    <div className="flex items-start gap-4">
      <Avatar
        src={avatarUrl}
        name={name}
        size="lg"
        className="!h-16 !w-16 !text-xl"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-smoke-100 truncate">
            {name}
          </h3>
          {status === 'active' && (
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" title="Active" aria-label="Online" role="status" />
          )}
        </div>
        {displayName && displayName !== fullName && (
          <p className="text-sm text-smoke-400">{fullName}</p>
        )}
        <span className="inline-block mt-1 rounded-full bg-smoke-700 px-2.5 py-0.5 text-xs font-medium text-smoke-300">
          {ROLE_LABELS[orgRole] ?? orgRole}
        </span>
        {bio && (
          <p className="mt-2 text-sm text-smoke-300 whitespace-pre-wrap">
            {bio}
          </p>
        )}
      </div>
    </div>
  )
}
