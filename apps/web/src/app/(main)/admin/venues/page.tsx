'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { VenueCardSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useToastStore } from '@/stores/toast'

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
  const [editVenue, setEditVenue] = useState<Venue | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [confirmArchive, setConfirmArchive] = useState<Venue | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const fetchVenues = async () => {
    try {
      const data = await api<{ data: Venue[] }>('/api/venues')
      setVenues(data.data || [])
    } catch {
      addToast('error', 'Failed to load venues')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchVenues() }, [])

  const handleCreate = async () => {
    setActionLoading(true)
    try {
      await api('/api/venues', {
        method: 'POST',
        body: JSON.stringify({ name, address }),
      })
      setCreateOpen(false)
      setName('')
      setAddress('')
      addToast('success', 'Venue created')
      await fetchVenues()
    } catch {
      addToast('error', 'Failed to create venue')
    } finally {
      setActionLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!editVenue) return
    setActionLoading(true)
    try {
      await api(`/api/venues/${editVenue.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, address: editAddress }),
      })
      addToast('success', 'Venue updated')
      setEditVenue(null)
      await fetchVenues()
    } catch {
      addToast('error', 'Failed to update venue')
    } finally {
      setActionLoading(false)
    }
  }

  const handleArchive = async () => {
    if (!confirmArchive) return
    setActionLoading(true)
    try {
      await api(`/api/venues/${confirmArchive.id}/archive`, { method: 'POST' })
      addToast('success', 'Venue archived')
      setConfirmArchive(null)
      await fetchVenues()
    } catch {
      addToast('error', 'Failed to archive venue')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnarchive = async (venue: Venue) => {
    setActionLoading(true)
    try {
      await api(`/api/venues/${venue.id}/unarchive`, { method: 'POST' })
      addToast('success', 'Venue restored')
      await fetchVenues()
    } catch {
      addToast('error', 'Failed to restore venue')
    } finally {
      setActionLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-smoke-100">Venues</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <VenueCardSkeleton />
          <VenueCardSkeleton />
          <VenueCardSkeleton />
        </div>
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
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditVenue(v)
                  setEditName(v.name)
                  setEditAddress(v.address)
                }}
              >
                Edit
              </Button>
              {v.status === 'active' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmArchive(v)}
                >
                  Archive
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUnarchive(v)}
                  isLoading={actionLoading}
                >
                  Restore
                </Button>
              )}
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
            <Button onClick={handleCreate} isLoading={actionLoading}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editVenue}
        onClose={() => setEditVenue(null)}
        title="Edit venue"
      >
        <div className="space-y-4">
          <Input
            id="editVenueName"
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Venue name"
          />
          <Input
            id="editVenueAddress"
            label="Address"
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
            placeholder="123 Main St, City, State"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditVenue(null)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} isLoading={actionLoading}>Save</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!confirmArchive}
        onClose={() => setConfirmArchive(null)}
        title="Archive venue"
      >
        <div className="space-y-4">
          <p className="text-sm text-smoke-300">
            Are you sure you want to archive <span className="font-medium text-smoke-100">{confirmArchive?.name}</span>? It can be restored later.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConfirmArchive(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleArchive} isLoading={actionLoading}>
              Archive
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
