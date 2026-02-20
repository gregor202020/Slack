'use client'

import { useCallback } from 'react'
import { useToastStore, type ToastVariant } from '@/stores/toast'

export function useToast() {
  const addToast = useToastStore((s) => s.addToast)

  const toast = useCallback(
    (variant: ToastVariant, message: string, duration?: number) => {
      addToast(variant, message, duration)
    },
    [addToast],
  )

  const success = useCallback(
    (message: string, duration?: number) => addToast('success', message, duration),
    [addToast],
  )

  const error = useCallback(
    (message: string, duration?: number) => addToast('error', message, duration),
    [addToast],
  )

  const info = useCallback(
    (message: string, duration?: number) => addToast('info', message, duration),
    [addToast],
  )

  const warning = useCallback(
    (message: string, duration?: number) => addToast('warning', message, duration),
    [addToast],
  )

  return { toast, success, error, info, warning }
}
