'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PHONE_REGEX } from '@smoker/shared'

export default function LoginPage() {
  const router = useRouter()
  const requestOtp = useAuthStore((s) => s.requestOtp)
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!PHONE_REGEX.test(phone)) {
      setError('Enter a valid phone number in international format (e.g. +15551234567)')
      return
    }

    setIsLoading(true)

    try {
      await requestOtp(phone)
      // Store phone in sessionStorage for the verify page
      sessionStorage.setItem('otpPhone', phone)
      router.push('/verify')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Try again.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-smoke-800 border border-smoke-600 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-smoke-100">Sign in</h2>
          <p className="text-sm text-smoke-400 mt-1">
            Enter your phone number to receive a verification code.
          </p>
        </div>

        <Input
          id="phone"
          type="tel"
          label="Phone number"
          placeholder="+1 (555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error}
          required
          autoFocus
        />

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Send code
        </Button>
      </div>

      <p className="text-center text-xs text-smoke-500">
        You must have an active invite to sign in.
      </p>
    </form>
  )
}
