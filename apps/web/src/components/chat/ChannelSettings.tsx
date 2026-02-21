'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useChatStore, type Channel } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { MemberList } from '@/components/chat/MemberList'
import { AddMemberModal } from '@/components/chat/AddMemberModal'

interface ChannelSettingsProps {
  isOpen: boolean
  onClose: () => void
  channel: Channel
}

type NotificationPref = 'all' | 'mentions' | 'muted'

export function ChannelSettings({ isOpen, onClose, channel }: ChannelSettingsProps) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const updateChannel = useChatStore((s) => s.updateChannel)
  const archiveChannel = useChatStore((s) => s.archiveChannel)
  const unarchiveChannel = useChatStore((s) => s.unarchiveChannel)
  const deleteChannel = useChatStore((s) => s.deleteChannel)
  const leaveChannel = useChatStore((s) => s.leaveChannel)
  const fetchChannelMembers = useChatStore((s) => s.fetchChannelMembers)
  const updateNotificationPref = useChatStore((s) => s.updateNotificationPref)

  const [name, setName] = useState(channel.name)
  const [topic, setTopic] = useState(channel.topic ?? '')
  const [description, setDescription] = useState(channel.description ?? '')
  const [notifPref, setNotifPref] = useState<NotificationPref>('all')
  const [isSaving, setIsSaving] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'members' | 'notifications'>('info')

  const isAdmin = user?.orgRole === 'admin' || user?.orgRole === 'super_admin'
  const isOwner = channel.ownerUserId === user?.id

  useEffect(() => {
    if (isOpen) {
      setName(channel.name)
      setTopic(channel.topic ?? '')
      setDescription(channel.description ?? '')
      fetchChannelMembers(channel.id)
    }
  }, [isOpen, channel, fetchChannelMembers])

  const handleSaveInfo = useCallback(async () => {
    setIsSaving(true)
    try {
      await updateChannel(channel.id, { name, topic, description })
      setIsSaving(false)
    } catch {
      setIsSaving(false)
    }
  }, [channel.id, name, topic, description, updateChannel])

  const handleArchive = useCallback(async () => {
    setIsArchiving(true)
    try {
      if (channel.isArchived) {
        await unarchiveChannel(channel.id)
      } else {
        await archiveChannel(channel.id)
      }
      setShowArchiveConfirm(false)
      onClose()
    } catch {
      // Silently fail
    } finally {
      setIsArchiving(false)
    }
  }, [channel.id, channel.isArchived, archiveChannel, unarchiveChannel, onClose])

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      await deleteChannel(channel.id)
      setShowDeleteConfirm(false)
      onClose()
      router.push('/channels')
    } catch {
      // Silently fail
    } finally {
      setIsDeleting(false)
    }
  }, [channel.id, deleteChannel, onClose, router])

  const handleLeave = useCallback(async () => {
    setIsLeaving(true)
    try {
      await leaveChannel(channel.id)
      onClose()
      router.push('/channels')
    } catch {
      // Silently fail
    } finally {
      setIsLeaving(false)
    }
  }, [channel.id, leaveChannel, onClose, router])

  const handleNotifChange = useCallback(async (pref: NotificationPref) => {
    setNotifPref(pref)
    try {
      await updateNotificationPref(channel.id, pref)
    } catch {
      // Silently fail
    }
  }, [channel.id, updateNotificationPref])

  if (!isOpen) return null

  return (
    <>
      {/* Slide-out panel */}
      <div className="fixed inset-0 z-40" onClick={onClose}>
        <div className="fixed inset-0 bg-black/40" />
      </div>
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-smoke-800 border-l border-smoke-600 shadow-2xl flex flex-col overflow-hidden" role="dialog" aria-modal="true" aria-label="Channel settings">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-smoke-600 px-6 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-smoke-100">Channel Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close channel settings"
            className="text-smoke-400 hover:text-smoke-100 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-smoke-600 shrink-0">
          {(['info', 'members', 'notifications'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'text-brand border-b-2 border-brand'
                  : 'text-smoke-400 hover:text-smoke-200'
              }`}
            >
              {tab === 'info' ? 'Info' : tab === 'members' ? 'Members' : 'Notifications'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {/* Info Tab */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <Input
                label="Channel name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner && !isAdmin}
              />
              <Input
                label="Topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What is this channel about?"
                disabled={!isOwner && !isAdmin}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-smoke-200">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe this channel..."
                  disabled={!isOwner && !isAdmin}
                  rows={3}
                  className="w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 py-2 text-sm text-smoke-100 placeholder:text-smoke-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent disabled:opacity-50"
                />
              </div>

              {(isOwner || isAdmin) && (
                <Button
                  size="sm"
                  onClick={handleSaveInfo}
                  isLoading={isSaving}
                >
                  Save changes
                </Button>
              )}

              {/* Danger Zone */}
              {isAdmin && (
                <div className="pt-4 mt-4 border-t border-smoke-600">
                  <h3 className="text-sm font-semibold text-error mb-3">Danger Zone</h3>
                  <div className="space-y-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowArchiveConfirm(true)}
                    >
                      {channel.isArchived ? 'Unarchive channel' : 'Archive channel'}
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      Delete channel
                    </Button>
                  </div>
                </div>
              )}

              {/* Leave channel */}
              {!channel.isMandatory && (
                <div className="pt-4 mt-4 border-t border-smoke-600">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-error hover:text-error"
                    onClick={handleLeave}
                    isLoading={isLeaving}
                  >
                    Leave channel
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <MemberList
              channelId={channel.id}
              onAddMembers={() => setShowAddMembers(true)}
            />
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-3">
              <p className="text-sm text-smoke-300">
                Choose how you want to be notified about new messages in this channel.
              </p>
              {(['all', 'mentions', 'muted'] as const).map((pref) => (
                <label
                  key={pref}
                  className="flex items-center gap-3 px-3 py-3 rounded-md hover:bg-smoke-700 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="notif-pref"
                    value={pref}
                    checked={notifPref === pref}
                    onChange={() => handleNotifChange(pref)}
                    className="accent-brand"
                  />
                  <div>
                    <p className="text-sm font-medium text-smoke-100">
                      {pref === 'all' ? 'All messages' : pref === 'mentions' ? 'Mentions only' : 'Muted'}
                    </p>
                    <p className="text-xs text-smoke-400">
                      {pref === 'all'
                        ? 'Get notified for every new message'
                        : pref === 'mentions'
                          ? 'Only get notified when you are mentioned'
                          : 'No notifications from this channel'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Archive confirmation modal */}
      <Modal
        isOpen={showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(false)}
        title={channel.isArchived ? 'Unarchive Channel' : 'Archive Channel'}
      >
        <p className="text-sm text-smoke-300 mb-4">
          {channel.isArchived
            ? `Are you sure you want to unarchive #${channel.name}? Members will be able to send messages again.`
            : `Are you sure you want to archive #${channel.name}? No one will be able to send messages in this channel.`}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowArchiveConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant={channel.isArchived ? 'primary' : 'danger'}
            size="sm"
            onClick={handleArchive}
            isLoading={isArchiving}
          >
            {channel.isArchived ? 'Unarchive' : 'Archive'}
          </Button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Channel"
      >
        <p className="text-sm text-smoke-300 mb-4">
          Are you sure you want to permanently delete <strong>#{channel.name}</strong>?
          This action cannot be undone. All messages and data in this channel will be lost.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDelete}
            isLoading={isDeleting}
          >
            Delete permanently
          </Button>
        </div>
      </Modal>

      {/* Add members modal */}
      <AddMemberModal
        isOpen={showAddMembers}
        onClose={() => setShowAddMembers(false)}
        channelId={channel.id}
      />
    </>
  )
}
