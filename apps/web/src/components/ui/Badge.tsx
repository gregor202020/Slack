import { clsx } from 'clsx'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  children: React.ReactNode
  className?: string
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        {
          'bg-smoke-600 text-smoke-200': variant === 'default',
          'bg-green-900/50 text-green-300': variant === 'success',
          'bg-yellow-900/50 text-yellow-300': variant === 'warning',
          'bg-red-900/50 text-red-300': variant === 'error',
          'bg-blue-900/50 text-blue-300': variant === 'info',
        },
        className,
      )}
    >
      {children}
    </span>
  )
}
