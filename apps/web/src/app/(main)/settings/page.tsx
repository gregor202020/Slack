'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { Button } from '@/components/ui/Button'

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const updatePreferences = useAuthStore((s) => s.updatePreferences)
  const addToast = useToastStore((s) => s.addToast)

  const [theme, setTheme] = useState<'dark' | 'light'>(
    (user?.theme as 'dark' | 'light') ?? 'dark',
  )
  const [notificationSound, setNotificationSound] = useState(
    user?.notificationSound ?? true,
  )
  const [notificationDesktop, setNotificationDesktop] = useState(
    user?.notificationDesktop ?? true,
  )
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges =
    theme !== ((user?.theme as 'dark' | 'light') ?? 'dark') ||
    notificationSound !== (user?.notificationSound ?? true) ||
    notificationDesktop !== (user?.notificationDesktop ?? true)

  const handleSave = async () => {
    if (!hasChanges || isSaving) return
    setIsSaving(true)

    try {
      await updatePreferences({
        theme,
        notificationSound,
        notificationDesktop,
      })
      addToast('success', 'Preferences saved successfully')
    } catch {
      addToast('error', 'Failed to save preferences')
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-smoke-100">Settings</h1>
          <p className="text-sm text-smoke-400 mt-1">
            Customize your app experience
          </p>
        </div>

        {/* Theme */}
        <div className="bg-smoke-800 rounded-lg border border-smoke-600 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-smoke-400 mb-4">
            Appearance
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-smoke-100">Theme</p>
              <p className="text-xs text-smoke-400 mt-0.5">
                Choose between dark and light mode
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  theme === 'dark'
                    ? 'bg-brand text-white'
                    : 'bg-smoke-700 text-smoke-300 hover:bg-smoke-600'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  theme === 'light'
                    ? 'bg-brand text-white'
                    : 'bg-smoke-700 text-smoke-300 hover:bg-smoke-600'
                }`}
              >
                Light
              </button>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-smoke-800 rounded-lg border border-smoke-600 p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-smoke-400 mb-2">
            Notifications
          </h2>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-smoke-100">
                Notification Sound
              </p>
              <p className="text-xs text-smoke-400 mt-0.5">
                Play a sound when you receive a notification
              </p>
            </div>
            <button
              onClick={() => setNotificationSound(!notificationSound)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                notificationSound ? 'bg-brand' : 'bg-smoke-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  notificationSound ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-smoke-700" />

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-smoke-100">
                Desktop Notifications
              </p>
              <p className="text-xs text-smoke-400 mt-0.5">
                Show browser notifications for new messages
              </p>
            </div>
            <button
              onClick={() => setNotificationDesktop(!notificationDesktop)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                notificationDesktop ? 'bg-brand' : 'bg-smoke-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  notificationDesktop ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            isLoading={isSaving}
          >
            Save Preferences
          </Button>
        </div>
      </div>
    </div>
  )
}
