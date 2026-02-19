'use client'

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chat'

export function useSocket() {
  const setupSocketListeners = useChatStore((s) => s.setupSocketListeners)

  useEffect(() => {
    setupSocketListeners()
  }, [setupSocketListeners])
}
