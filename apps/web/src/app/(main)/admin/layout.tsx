'use client'

import { usePathname, useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

const tabs = [
  { label: 'Users', href: '/admin/users' },
  { label: 'Venues', href: '/admin/venues' },
  { label: 'Announcements', href: '/admin/announcements' },
  { label: 'Shifts', href: '/admin/shifts' },
  { label: 'Maintenance', href: '/admin/maintenance' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <div className="flex flex-col h-full">
      <nav className="border-b border-smoke-600 px-4 pt-3" aria-label="Admin navigation">
        <div className="flex items-center gap-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.href}
              onClick={() => router.push(tab.href)}
              role="tab"
              aria-selected={pathname.startsWith(tab.href)}
              aria-current={pathname.startsWith(tab.href) ? 'page' : undefined}
              className={clsx(
                'px-3 py-2 text-sm font-medium rounded-t-md transition-colors',
                pathname.startsWith(tab.href)
                  ? 'bg-smoke-700 text-smoke-100 border-b-2 border-brand'
                  : 'text-smoke-400 hover:text-smoke-200 hover:bg-smoke-800',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="flex-1 overflow-auto p-6">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </div>
    </div>
  )
}
