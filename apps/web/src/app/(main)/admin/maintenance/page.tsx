'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'

interface MaintenanceRequest {
  id: string
  title: string
  description: string
  status: string
  priority: string
  createdAt: string
}

export default function AdminMaintenancePage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' })

  const loadRequests = () => {
    api<{ data: MaintenanceRequest[] }>('/api/maintenance')
      .then((data) => setRequests(data.data || []))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api('/api/maintenance', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setCreateOpen(false)
      setForm({ title: '', description: '', priority: 'medium' })
      loadRequests()
    } catch (err) {
      console.error('Failed to create maintenance request:', err)
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'open': return <Badge variant="warning">Open</Badge>
      case 'in_progress': return <Badge variant="info">In Progress</Badge>
      case 'done': return <Badge variant="success">Done</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  const priorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent': return <Badge variant="error">Urgent</Badge>
      case 'high': return <Badge variant="warning">High</Badge>
      case 'medium': return <Badge variant="info">Medium</Badge>
      default: return <Badge>Low</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-smoke-100">Maintenance Requests</h2>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-smoke-600 bg-smoke-800 p-4 space-y-2">
              <div className="flex items-start justify-between">
                <Skeleton variant="text" className="h-5 w-40" />
                <div className="flex gap-2">
                  <Skeleton variant="text" className="h-5 w-14 rounded-full" />
                  <Skeleton variant="text" className="h-5 w-14 rounded-full" />
                </div>
              </div>
              <Skeleton variant="text" className="h-3.5 w-full" />
              <Skeleton variant="text" className="h-3.5 w-1/2" />
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
        <h2 className="text-xl font-semibold text-smoke-100">Maintenance Requests</h2>
        <Button onClick={() => setCreateOpen(true)}>New request</Button>
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-smoke-600 bg-smoke-800 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-smoke-100">New Maintenance Request</h3>

            <div className="space-y-3">
              <div>
                <label htmlFor="req-title" className="block text-sm text-smoke-300 mb-1">Title</label>
                <input
                  id="req-title"
                  type="text"
                  placeholder="e.g. Broken smoker thermostat"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full rounded border border-smoke-600 bg-smoke-900 px-3 py-2 text-sm text-smoke-100 placeholder:text-smoke-500 focus:outline-none focus:ring-1 focus:ring-ember-500"
                />
              </div>

              <div>
                <label htmlFor="req-desc" className="block text-sm text-smoke-300 mb-1">Description</label>
                <textarea
                  id="req-desc"
                  rows={3}
                  placeholder="Describe the issue..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded border border-smoke-600 bg-smoke-900 px-3 py-2 text-sm text-smoke-100 placeholder:text-smoke-500 focus:outline-none focus:ring-1 focus:ring-ember-500"
                />
              </div>

              <div>
                <label htmlFor="req-priority" className="block text-sm text-smoke-300 mb-1">Priority</label>
                <select
                  id="req-priority"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full rounded border border-smoke-600 bg-smoke-900 px-3 py-2 text-sm text-smoke-100 focus:outline-none focus:ring-1 focus:ring-ember-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCreateOpen(false)
                  setForm({ title: '', description: '', priority: 'medium' })
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving || !form.title.trim()}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-smoke-400 text-center py-8">No maintenance requests. Everything running smooth.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-smoke-600 bg-smoke-800 p-4 space-y-2"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-base font-medium text-smoke-100">{r.title}</h3>
                <div className="flex gap-2">
                  {priorityBadge(r.priority)}
                  {statusBadge(r.status)}
                </div>
              </div>
              <p className="text-sm text-smoke-300 line-clamp-2">{r.description}</p>
              <p className="text-xs text-smoke-500">
                {new Date(r.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
