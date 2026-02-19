'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

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

  useEffect(() => {
    api<{ data: MaintenanceRequest[] }>('/api/maintenance')
      .then((data) => setRequests(data.data || []))
      .finally(() => setIsLoading(false))
  }, [])

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
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-smoke-100">Maintenance Requests</h2>
        <Button>New request</Button>
      </div>

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
