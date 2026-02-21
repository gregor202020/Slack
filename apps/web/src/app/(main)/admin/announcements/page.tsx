'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToastStore } from '@/stores/toast'

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
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [scope, setScope] = useState<'system' | 'venue' | 'channel'>('system')
  const [ackRequired, setAckRequired] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const fetchAnnouncements = async () => {
    try {
      const data = await api<{ data: Announcement[] }>('/api/announcements')
      setAnnouncements(data.data || [])
    } catch {
      addToast('error', 'Failed to load announcements')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchAnnouncements() }, [])

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      addToast('warning', 'Title and body are required')
      return
    }
    setActionLoading(true)
    try {
      await api('/api/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body, scope, ackRequired }),
      })
      addToast('success', 'Announcement created')
      setCreateOpen(false)
      setTitle('')
      setBody('')
      setScope('system')
      setAckRequired(false)
      await fetchAnnouncements()
    } catch {
      addToast('error', 'Failed to create announcement')
    } finally {
      setActionLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-smoke-100">Announcements</h2>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-smoke-600 bg-smoke-800 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <Skeleton variant="text" className="h-5 w-48" />
                <Skeleton variant="text" className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton variant="text" className="h-3.5 w-full" />
              <Skeleton variant="text" className="h-3.5 w-2/3" />
              <Skeleton variant="text" className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-smoke-100">Announcements</h2>
        <Button onClick={() => setCreateOpen(true)}>New announcement</Button>
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

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New announcement">
        <div className="space-y-4">
          <Input
            id="annTitle"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Announcement title"
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="annBody" className="text-sm font-medium text-smoke-200">
              Body
            </label>
            <textarea
              id="annBody"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the announcement content..."
              rows={4}
              className="w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 py-2 text-sm text-smoke-100 placeholder:text-smoke-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="annScope" className="text-sm font-medium text-smoke-200">
              Scope
            </label>
            <select
              id="annScope"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'system' | 'venue' | 'channel')}
              className="h-10 w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 text-sm text-smoke-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="system">System (everyone)</option>
              <option value="venue">Venue</option>
              <option value="channel">Channel</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ackRequired}
              onChange={(e) => setAckRequired(e.target.checked)}
              className="h-4 w-4 rounded border-smoke-600 bg-smoke-700 text-brand focus:ring-brand"
            />
            <span className="text-sm text-smoke-200">Require acknowledgement</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} isLoading={actionLoading}>
              Publish
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
