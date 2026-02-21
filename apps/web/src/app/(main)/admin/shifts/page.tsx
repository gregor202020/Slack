'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { useToastStore } from '@/stores/toast'

interface Shift {
  id: string
  userId: string
  venueId: string
  position: string
  startTime: string
  endTime: string
  notes?: string
}

interface UserOption {
  id: string
  firstName?: string
  lastName?: string
  displayName?: string
  fullName?: string
}

interface VenueOption {
  id: string
  name: string
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [users, setUsers] = useState<UserOption[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedVenue, setSelectedVenue] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [roleLabel, setRoleLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const fetchShifts = async () => {
    try {
      const data = await api<{ data: Shift[] }>('/api/shifts/my')
      setShifts(data.data || [])
    } catch {
      addToast('error', 'Failed to load shifts')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchShifts() }, [])

  const openCreateModal = async () => {
    setCreateOpen(true)
    try {
      const [usersData, venuesData] = await Promise.all([
        api<{ data: UserOption[] }>('/api/users'),
        api<{ data: VenueOption[] }>('/api/venues'),
      ])
      setUsers(usersData.data || [])
      setVenues(venuesData.data || [])
    } catch {
      addToast('error', 'Failed to load users or venues')
    }
  }

  const handleCreate = async () => {
    if (!selectedUser || !selectedVenue || !startTime || !endTime) {
      addToast('warning', 'User, venue, start time, and end time are required')
      return
    }
    setActionLoading(true)
    try {
      await api('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUser,
          venueId: selectedVenue,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          roleLabel: roleLabel || undefined,
          notes: notes || undefined,
        }),
      })
      addToast('success', 'Shift created')
      setCreateOpen(false)
      setSelectedUser('')
      setSelectedVenue('')
      setStartTime('')
      setEndTime('')
      setRoleLabel('')
      setNotes('')
      await fetchShifts()
    } catch {
      addToast('error', 'Failed to create shift')
    } finally {
      setActionLoading(false)
    }
  }

  const getUserLabel = (u: UserOption) => {
    return u.displayName || u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.id
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-smoke-100">Shifts</h2>
        </div>
        <div className="rounded-lg border border-smoke-600 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-smoke-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Position</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Start</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">End</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-smoke-700">
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-smoke-100">Shifts</h2>
        <Button onClick={openCreateModal}>Create shift</Button>
      </div>

      {shifts.length === 0 ? (
        <p className="text-smoke-400 text-center py-8">No shifts this week. Enjoy the break.</p>
      ) : (
        <div className="rounded-lg border border-smoke-600 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-smoke-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Position</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Start</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">End</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-smoke-700">
              {shifts.map((s) => (
                <tr key={s.id} className="hover:bg-smoke-800 transition-colors">
                  <td className="px-4 py-3 text-sm text-smoke-100">{s.position}</td>
                  <td className="px-4 py-3 text-sm text-smoke-300">
                    {new Date(s.startTime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-smoke-300">
                    {new Date(s.endTime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-smoke-400">{s.notes || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create shift">
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="shiftUser" className="text-sm font-medium text-smoke-200">
              Assign to user
            </label>
            <select
              id="shiftUser"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="h-10 w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 text-sm text-smoke-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Select a user...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{getUserLabel(u)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="shiftVenue" className="text-sm font-medium text-smoke-200">
              Venue
            </label>
            <select
              id="shiftVenue"
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
              className="h-10 w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 text-sm text-smoke-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="">Select a venue...</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <Input
            id="shiftStart"
            label="Start time"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
          <Input
            id="shiftEnd"
            label="End time"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
          <Input
            id="shiftRole"
            label="Role / Position"
            value={roleLabel}
            onChange={(e) => setRoleLabel(e.target.value)}
            placeholder="e.g. Bar, Kitchen, Floor"
          />
          <Input
            id="shiftNotes"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} isLoading={actionLoading}>
              Create
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
