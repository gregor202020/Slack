'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

interface Shift {
  id: string
  userId: string
  venueId: string
  position: string
  startTime: string
  endTime: string
  notes?: string
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api<{ data: Shift[] }>('/api/shifts/my')
      .then((data) => setShifts(data.data || []))
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-smoke-100">Shifts</h2>
        <Button>Create shift</Button>
      </div>

      {shifts.length === 0 ? (
        <p className="text-smoke-400 text-center py-8">No shifts this week. Enjoy the break.</p>
      ) : (
        <div className="rounded-lg border border-smoke-600 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-smoke-800 text-left">
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Position</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Start</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">End</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-smoke-400">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-smoke-700">
              {shifts.map((s) => (
                <tr key={s.id} className="hover:bg-smoke-800 transition-colors">
                  <td className="px-4 py-3 text-sm text-smoke-100">{s.position}</td>
                  <td className="px-4 py-3 text-sm text-smoke-300">
                    {new Date(s.startTime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-smoke-300">
                    {new Date(s.endTime).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-smoke-400">{s.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
