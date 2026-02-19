'use client'

import { useEffect } from 'react'
import { getSocket } from '@/lib/socket'
import { setupSocketListeners } from '@/stores/chat'

export function useSocket() {
  useEffect(() => {
    const socket = getSocket()
    const cleanup = setupSocketListeners(socket)
    return () => {
      cleanup()
    }
  }, [])
}
