'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface Announcement {
  id: string
  title: string
  body: string
  scope: string
  ackRequired: boolean
  locked: boolean
  createdAt: string
}

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api<{ data: Announcement[] }>('/api/announcements')
      .then((data) => setAnnouncements(data.data || []))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-smoke-100">Announcements</h2>
        <Button>New announcement</Button>
      </div>

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <p className="text-smoke-400 text-center py-8">No announcements yet.</p>
        ) : (
          announcements.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-smoke-600 bg-smoke-800 p-4 space-y-2"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-base font-semibold text-smoke-100">{a.title}</h3>
                <div className="flex gap-2">
                  <Badge variant={a.scope === 'org' ? 'info' : 'default'}>{a.scope}</Badge>
                  {a.ackRequired && <Badge variant="warning">Ack required</Badge>}
                  {a.locked && <Badge variant="error">Locked</Badge>}
                </div>
              </div>
              <p className="text-sm text-smoke-300 line-clamp-2">{a.body}</p>
              <p className="text-xs text-smoke-500">
                {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
