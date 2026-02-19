'use client'

import { CanvasEditor } from '@/components/canvas/CanvasEditor'

export default function CanvasPage() {
  return (
    <div className="flex flex-col h-full bg-smoke-900">
      <CanvasEditor />
    </div>
  )
}
