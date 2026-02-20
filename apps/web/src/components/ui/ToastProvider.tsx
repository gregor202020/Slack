'use client'

import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { useToastStore, type Toast, type ToastVariant } from '@/stores/toast'

const variantStyles: Record<ToastVariant, string> = {
  success: 'bg-green-900/90 border-green-700 text-green-100',
  error: 'bg-red-900/90 border-red-700 text-red-100',
  info: 'bg-blue-900/90 border-blue-700 text-blue-100',
  warning: 'bg-yellow-900/90 border-yellow-700 text-yellow-100',
}

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  success: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
    </svg>
  ),
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    const enterTimeout = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(enterTimeout)
  }, [])

  const handleDismiss = () => {
    setIsLeaving(true)
    setTimeout(onDismiss, 200)
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 rounded-lg border px-4 py-3 shadow-lg text-sm transition-all duration-200 max-w-sm',
        variantStyles[toast.variant],
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-0',
      )}
    >
      {variantIcons[toast.variant]}
      <p className="flex-1 min-w-0">{toast.message}</p>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export function ToastProvider() {
  const toasts = useToastStore((s) => s.toasts)
  const removeToast = useToastStore((s) => s.removeToast)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  )
}
