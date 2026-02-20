import { clsx } from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
}: SkeletonProps) {
  return (
    <div
      className={clsx(
        'animate-pulse bg-smoke-700',
        {
          'rounded-md h-4': variant === 'text',
          'rounded-full': variant === 'circular',
          'rounded-md': variant === 'rectangular',
        },
        className,
      )}
      style={{ width, height }}
    />
  )
}

/** A row that mimics a channel item in the sidebar. */
export function ChannelSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Skeleton variant="text" className="h-4 w-4 shrink-0" />
      <Skeleton variant="text" className="h-3.5 flex-1" />
    </div>
  )
}

/** A row that mimics a DM item in the sidebar. */
export function DmSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <Skeleton variant="circular" className="h-6 w-6 shrink-0" />
      <Skeleton variant="text" className="h-3.5 flex-1" />
    </div>
  )
}

/** A row that mimics a message bubble. */
export function MessageSkeleton() {
  return (
    <div className="flex items-start gap-3 px-2 py-1.5">
      <Skeleton variant="circular" className="h-8 w-8 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <div className="flex items-baseline gap-2">
          <Skeleton variant="text" className="h-3.5 w-24" />
          <Skeleton variant="text" className="h-3 w-12" />
        </div>
        <Skeleton variant="text" className="h-3.5 w-3/4" />
        <Skeleton variant="text" className="h-3.5 w-1/2" />
      </div>
    </div>
  )
}

/** A row that mimics a table row in admin pages. */
export function TableRowSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <tr>
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton variant="text" className="h-4" />
        </td>
      ))}
    </tr>
  )
}

/** A card that mimics a venue card in admin venues page. */
export function VenueCardSkeleton() {
  return (
    <div className="rounded-lg border border-smoke-600 bg-smoke-800 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton variant="text" className="h-5 w-32" />
        <Skeleton variant="text" className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton variant="text" className="h-3.5 w-48" />
      <div className="flex justify-end pt-2">
        <Skeleton variant="rectangular" className="h-8 w-20" />
      </div>
    </div>
  )
}
