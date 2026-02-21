'use client'

import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { TableRowSkeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { useToastStore } from '@/stores/toast'

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
  const [manageUserId, setManageUserId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ userId: string; action: string; label: string } | null>(null)
  const [roleChangeUser, setRoleChangeUser] = useState<{ id: string; currentRole: string } | null>(null)
  const [selectedRole, setSelectedRole] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const addToast = useToastStore((s) => s.addToast)

  const fetchUsers = async () => {
    try {
      const data = await api<{ data: User[] }>('/api/users')
      setUsers(data.data || [])
    } catch {
      addToast('error', 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setManageUserId(null)
      }
    }
    if (manageUserId) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [manageUserId])

  const handleInvite = async () => {
    try {
      await api('/api/invites', {
        method: 'POST',
        body: JSON.stringify({ phone: invitePhone, name: inviteName }),
      })
      setInviteOpen(false)
      setInvitePhone('')
      setInviteName('')
      addToast('success', 'Invite sent successfully')
    } catch {
      addToast('error', 'Failed to send invite')
    }
  }

  const handleSuspend = async (userId: string) => {
    setActionLoading(true)
    try {
      await api(`/api/users/${userId}/suspend`, { method: 'POST' })
      addToast('success', 'User suspended')
      setConfirmAction(null)
      setManageUserId(null)
      await fetchUsers()
    } catch {
      addToast('error', 'Failed to suspend user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnsuspend = async (userId: string) => {
    setActionLoading(true)
    try {
      await api(`/api/users/${userId}/unsuspend`, { method: 'POST' })
      addToast('success', 'User activated')
      setConfirmAction(null)
      setManageUserId(null)
      await fetchUsers()
    } catch {
      addToast('error', 'Failed to activate user')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRoleChange = async () => {
    if (!roleChangeUser || !selectedRole) return
    setActionLoading(true)
    try {
      await api(`/api/users/${roleChangeUser.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: selectedRole }),
      })
      addToast('success', 'Role updated')
      setRoleChangeUser(null)
      setSelectedRole('')
      setManageUserId(null)
      await fetchUsers()
    } catch {
      addToast('error', 'Failed to change role')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmedAction = () => {
    if (!confirmAction) return
    if (confirmAction.action === 'suspend') {
      handleSuspend(confirmAction.userId)
    } else if (confirmAction.action === 'activate') {
      handleUnsuspend(confirmAction.userId)
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
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setManageUserId(manageUserId === u.id ? null : u.id)}
                    >
                      Manage
                    </Button>
                    {manageUserId === u.id && (
                      <div
                        ref={dropdownRef}
                        className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-smoke-600 bg-smoke-800 py-1 shadow-xl"
                      >
                        <button
                          className="w-full px-4 py-2 text-left text-sm text-smoke-200 hover:bg-smoke-700 transition-colors"
                          onClick={() => {
                            setRoleChangeUser({ id: u.id, currentRole: u.orgRole })
                            setSelectedRole(u.orgRole)
                            setManageUserId(null)
                          }}
                        >
                          Change role
                        </button>
                        {u.status === 'active' ? (
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-warning hover:bg-smoke-700 transition-colors"
                            onClick={() => {
                              setConfirmAction({ userId: u.id, action: 'suspend', label: `Suspend ${u.displayName || u.firstName}?` })
                              setManageUserId(null)
                            }}
                          >
                            Suspend user
                          </button>
                        ) : u.status === 'suspended' ? (
                          <button
                            className="w-full px-4 py-2 text-left text-sm text-success hover:bg-smoke-700 transition-colors"
                            onClick={() => {
                              setConfirmAction({ userId: u.id, action: 'activate', label: `Activate ${u.displayName || u.firstName}?` })
                              setManageUserId(null)
                            }}
                          >
                            Activate user
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
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

      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title="Confirm action"
      >
        <div className="space-y-4">
          <p className="text-sm text-smoke-300">{confirmAction?.label} This action can be reversed later.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmedAction}
              isLoading={actionLoading}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!roleChangeUser}
        onClose={() => { setRoleChangeUser(null); setSelectedRole('') }}
        title="Change role"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="roleSelect" className="text-sm font-medium text-smoke-200">
              New role
            </label>
            <select
              id="roleSelect"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="h-10 w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 text-sm text-smoke-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              <option value="basic">Basic</option>
              <option value="mid">Mid</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => { setRoleChangeUser(null); setSelectedRole('') }}>
              Cancel
            </Button>
            <Button
              onClick={handleRoleChange}
              isLoading={actionLoading}
              disabled={selectedRole === roleChangeUser?.currentRole}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
