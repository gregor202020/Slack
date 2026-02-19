'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/Button'

const RESEND_COOLDOWN = 60

export default function VerifyPage() {
  const router = useRouter()
  const verifyOtp = useAuthStore((s) => s.verifyOtp)
  const requestOtp = useAuthStore((s) => s.requestOtp)
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState('')
  const [resendTimer, setResendTimer] = useState(RESEND_COOLDOWN)
  const [isResending, setIsResending] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    const stored = sessionStorage.getItem('otpPhone')
    if (!stored) {
      router.push('/login')
      return
    }
    setPhone(stored)
    inputRefs.current[0]?.focus()
  }, [router])

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  const handleResend = useCallback(async () => {
    if (resendTimer > 0 || !phone || isResending) return
    setIsResending(true)
    try {
      await requestOtp(phone)
      setResendTimer(RESEND_COOLDOWN)
      setCode(['', '', '', '', '', ''])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend code.')
    } finally {
      setIsResending(false)
    }
  }, [resendTimer, phone, isResending, requestOtp])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1)
    if (!/^\d*$/.test(value)) return

    const newCode = [...code]
    newCode[index] = value
    setCode(newCode)

    // Auto-advance to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all digits filled
    if (newCode.every((d) => d) && value) {
      handleSubmit(newCode.join(''))
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleSubmit = async (fullCode?: string) => {
    const otp = fullCode || code.join('')
    if (otp.length !== 6) return

    setError('')
    setIsLoading(true)

    try {
      const result = await verifyOtp(phone, otp)
      sessionStorage.removeItem('otpPhone')

      if (result.needsOnboarding) {
        router.push('/onboarding')
      } else {
        router.push('/channels')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Try again.')
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-smoke-800 border border-smoke-600 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-smoke-100">Enter your code</h2>
          <p className="text-sm text-smoke-400 mt-1">
            We sent a 6-digit code to {phone}
          </p>
        </div>

        <div className="flex justify-center gap-2">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="h-12 w-10 rounded-md bg-smoke-700 border border-smoke-600 text-center text-lg font-mono text-smoke-100 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          ))}
        </div>

        {error && <p className="text-sm text-error text-center">{error}</p>}

        <Button
          type="button"
          className="w-full"
          isLoading={isLoading}
          onClick={() => handleSubmit()}
          disabled={code.some((d) => !d)}
        >
          Verify
        </Button>
      </div>

      <div className="text-center text-sm">
        {resendTimer > 0 ? (
          <p className="text-smoke-400">
            Resend code in {resendTimer}s
          </p>
        ) : (
          <button
            onClick={handleResend}
            disabled={isResending}
            className="text-brand hover:text-brand-hover disabled:opacity-50 transition-colors"
          >
            {isResending ? 'Sending...' : 'Resend code'}
          </button>
        )}
      </div>

      <button
        onClick={() => router.push('/login')}
        className="block w-full text-center text-sm text-smoke-400 hover:text-smoke-200 transition-colors"
      >
        Use a different number
      </button>
    </div>
  )
}
