'use client'

import { useState, useRef, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Avatar } from '@/components/ui/Avatar'
import { UserProfileCard } from '@/components/profile/UserProfileCard'

const TIMEZONES = [
  'UTC',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Hobart',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
]

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const fetchMe = useAuthStore((s) => s.fetchMe)
  const addToast = useToastStore((s) => s.addToast)

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [timezone, setTimezone] = useState(user?.timezone ?? 'UTC')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const hasChanges =
    displayName !== (user?.displayName ?? '') ||
    bio !== (user?.bio ?? '') ||
    timezone !== (user?.timezone ?? 'UTC')

  const handleSave = async () => {
    if (!hasChanges || isSaving) return
    setIsSaving(true)

    try {
      await updateProfile({
        displayName: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        timezone,
      })
      addToast('success', 'Profile updated successfully')
    } catch {
      addToast('error', 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAvatarUpload = useCallback(async (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!validTypes.includes(file.type)) {
      addToast('error', 'Please upload a JPEG, PNG, WebP, or GIF image')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast('error', 'Image must be smaller than 5MB')
      return
    }

    setIsUploadingAvatar(true)
    try {
      const { uploadUrl } = await api<{ uploadUrl: string; avatarUrl: string }>(
        '/api/users/me/avatar',
        {
          method: 'POST',
          body: JSON.stringify({ contentType: file.type }),
        },
      )

      await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })

      await fetchMe()
      addToast('success', 'Avatar updated successfully')
    } catch {
      addToast('error', 'Failed to upload avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }, [addToast, fetchMe])

  const handleRemoveAvatar = async () => {
    try {
      await api('/api/users/me/avatar', { method: 'DELETE' })
      await fetchMe()
      addToast('success', 'Avatar removed')
    } catch {
      addToast('error', 'Failed to remove avatar')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleAvatarUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleAvatarUpload(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  if (!user) return null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-smoke-100">Edit Profile</h1>
          <p className="text-sm text-smoke-400 mt-1">
            Manage your profile information and avatar
          </p>
        </div>

        {/* Avatar section */}
        <div className="bg-smoke-800 rounded-lg border border-smoke-600 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-smoke-400 mb-4">
            Profile Picture
          </h2>
          <div className="flex items-center gap-6">
            <div
              className={`relative cursor-pointer rounded-full ${isDragging ? 'ring-2 ring-brand ring-offset-2 ring-offset-smoke-800' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <Avatar
                src={user.avatarUrl}
                name={user.displayName || user.firstName + ' ' + user.lastName}
                size="lg"
                className="!h-20 !w-20 !text-2xl"
              />
              {isUploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
                  <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            <div className="space-y-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                Upload Photo
              </Button>
              {user.avatarUrl && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar}
                >
                  Remove
                </Button>
              )}
              <p className="text-xs text-smoke-400">
                JPEG, PNG, WebP, or GIF. Max 5MB.
              </p>
            </div>
          </div>
        </div>

        {/* Profile fields */}
        <div className="bg-smoke-800 rounded-lg border border-smoke-600 p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-smoke-400 mb-2">
            Profile Information
          </h2>

          <Input
            id="displayName"
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you want to appear to others"
            maxLength={80}
          />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="bio" className="text-sm font-medium text-smoke-200">
              Bio
            </label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell your team a bit about yourself"
              maxLength={500}
              rows={3}
              className="w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 py-2 text-sm text-smoke-100 placeholder:text-smoke-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
            <p className="text-xs text-smoke-400 text-right">{bio.length}/500</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="timezone" className="text-sm font-medium text-smoke-200">
              Timezone
            </label>
            <select
              id="timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-10 w-full rounded-md bg-smoke-700 border border-smoke-600 px-3 text-sm text-smoke-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              isLoading={isSaving}
            >
              Save Changes
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-smoke-800 rounded-lg border border-smoke-600 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-smoke-400 mb-4">
            Profile Preview
          </h2>
          <UserProfileCard
            avatarUrl={user.avatarUrl}
            displayName={displayName || user.displayName}
            fullName={user.firstName + ' ' + user.lastName}
            orgRole={user.orgRole}
            bio={bio}
            status={user.status}
          />
        </div>
      </div>
    </div>
  )
}
