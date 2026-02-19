'use client'

import { clsx } from 'clsx'

interface AvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  isOnline?: boolean
  className?: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const COLORS = [
  'bg-brand', 'bg-accent', 'bg-emerald-600', 'bg-purple-600',
  'bg-pink-600', 'bg-cyan-600', 'bg-amber-600', 'bg-indigo-600',
]

function getColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function Avatar({ src, name, size = 'md', isOnline, className }: AvatarProps) {
  const sizeClasses = {
    sm: 'h-6 w-6 text-xs',
    md: 'h-8 w-8 text-sm',
    lg: 'h-10 w-10 text-base',
  }

  return (
    <div className={clsx('relative inline-flex shrink-0', className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={clsx('rounded-full object-cover', sizeClasses[size])}
        />
      ) : (
        <div
          className={clsx(
            'rounded-full flex items-center justify-center font-medium text-white',
            sizeClasses[size],
            getColor(name),
          )}
        >
          {getInitials(name)}
        </div>
      )}
      {isOnline !== undefined && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 block rounded-full border-2 border-smoke-900',
            isOnline ? 'bg-online' : 'bg-offline',
            size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5',
          )}
        />
      )}
    </div>
  )
}
