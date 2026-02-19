'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'

interface Venue {
  id: string
  name: string
  address: string
  status: string
  memberCount?: number
}

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  useEffect(() => {
    api<{ data: Venue[] }>('/api/venues')
      .then((data) => setVenues(data.data || []))
      .finally(() => setIsLoading(false))
  }, [])

  const handleCreate = async () => {
    try {
      await api('/api/venues', {
        method: 'POST',
        body: JSON.stringify({ name, address }),
      })
      setCreateOpen(false)
      setName('')
      setAddress('')
      const data = await api<{ data: Venue[] }>('/api/venues')
      setVenues(data.data || [])
    } catch {
      // handle error
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
        <h2 className="text-xl font-semibold text-smoke-100">Venues</h2>
        <Button onClick={() => setCreateOpen(true)}>Create venue</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {venues.map((v) => (
          <div
            key={v.id}
            className="rounded-lg border border-smoke-600 bg-smoke-800 p-4 space-y-2 hover:border-smoke-500 transition-colors"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-smoke-100">{v.name}</h3>
              <Badge variant={v.status === 'active' ? 'success' : 'warning'}>
                {v.status}
              </Badge>
            </div>
            <p className="text-sm text-smoke-400">{v.address}</p>
            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm">Manage</Button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create venue">
        <div className="space-y-4">
          <Input
            id="venueName"
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Downtown Location"
          />
          <Input
            id="venueAddress"
            label="Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St, City, State"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
