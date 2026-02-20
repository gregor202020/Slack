'use client'

import { CanvasEditor } from '@/components/canvas/CanvasEditor'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

export default function CanvasPage() {
  return (
    <div className="flex flex-col h-full bg-smoke-900">
      <ErrorBoundary>
        <CanvasEditor />
      </ErrorBoundary>
    </div>
  )
}
