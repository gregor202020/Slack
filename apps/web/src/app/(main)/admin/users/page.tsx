'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'

interface User {
  id: string
  firstName: string
  lastName: string
  displayName: string
  orgRole: string
  status: string
  avatarUrl: string | null
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invitePhone, setInvitePhone] = useState('')
  const [inviteName, setInviteName] = useState('')

  const fetchUsers = async () => {
    try {
      const data = await api<{ data: User[] }>('/api/users')
      setUsers(data.data || [])
    } catch {
      // handle error
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const handleInvite = async () => {
    try {
      await api('/api/invites', {
        method: 'POST',
        body: JSON.stringify({ phone: invitePhone, name: inviteName }),
      })
      setInviteOpen(false)
      setInvitePhone('')
      setInviteName('')
    } catch {
      // handle error
    }
  }

  const statusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge variant="success">Active</Badge>
      case 'suspended': return <Badge variant="warning">Suspended</Badge>
      case 'deactivated': return <Badge variant="error">Deactivated</Badge>
      default: return <Badge>{status}</Badge>
    }
  }

  const roleBadge = (role: string) => {
    switch (role) {
      case 'super_admin': return <Badge variant="error">Super Admin</Badge>
      case 'admin': return <Badge variant="info">Admin</Badge>
      default: return <Badge>{role}</Badge>
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-smoke-100">Users</h2>
        </div>
        <div className="rounded-lg border border-smoke-600 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-smoke-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">User</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Role</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Status</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-smoke-700">
              <TableRowSkeleton columns={4} />
              <TableRowSkeleton columns={4} />
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
        <h2 className="text-xl font-semibold text-smoke-100">Users</h2>
        <Button onClick={() => setInviteOpen(true)}>Invite user</Button>
      </div>

      <div className="rounded-lg border border-smoke-600 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-smoke-800 text-left">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">User</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Role</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Status</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-smoke-700">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-smoke-800 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={u.displayName || `${u.firstName} ${u.lastName}`}
                      src={u.avatarUrl}
                      size="md"
                    />
                    <div>
                      <p className="text-sm font-medium text-smoke-100">
                        {u.displayName || `${u.firstName} ${u.lastName}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{roleBadge(u.orgRole)}</td>
                <td className="px-4 py-3">{statusBadge(u.status)}</td>
                <td className="px-4 py-3">
                  <Button variant="ghost" size="sm">Manage</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite user">
        <div className="space-y-4">
          <Input
            id="inviteName"
            label="Name"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            placeholder="John Smith"
          />
          <Input
            id="invitePhone"
            label="Phone number"
            type="tel"
            value={invitePhone}
            onChange={(e) => setInvitePhone(e.target.value)}
            placeholder="+1 (555) 123-4567"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite}>Send invite</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
