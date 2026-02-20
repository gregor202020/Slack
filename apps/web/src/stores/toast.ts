import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  variant: ToastVariant
  message: string
  duration?: number
}

interface ToastState {
  toasts: Toast[]
  addToast: (variant: ToastVariant, message: string, duration?: number) => void
  removeToast: (id: string) => void
}

let nextId = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (variant, message, duration = 5000) => {
    const id = `toast-${++nextId}`
    set((state) => ({
      toasts: [...state.toasts, { id, variant, message, duration }],
    }))

    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, duration)
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))
