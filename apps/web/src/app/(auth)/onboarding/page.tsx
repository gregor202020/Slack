'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function OnboardingPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await api('/api/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify({ firstName, lastName, displayName }),
      })
      router.push('/channels')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-smoke-800 border border-smoke-600 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-smoke-100">Welcome to the crew</h2>
          <p className="text-sm text-smoke-400 mt-1">
            Set up your profile to get started.
          </p>
        </div>

        <Input
          id="firstName"
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          autoFocus
        />

        <Input
          id="lastName"
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />

        <Input
          id="displayName"
          label="Display name"
          placeholder="How should we call you?"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />

        {error && <p className="text-sm text-error">{error}</p>}

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Let&apos;s go
        </Button>
      </div>
    </form>
  )
}
