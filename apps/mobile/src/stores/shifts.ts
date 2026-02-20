/**
 * Shifts store — manages shift data and swap requests with Zustand.
 *
 * API endpoints used:
 *   GET  /api/shifts/my                      — list user's upcoming shifts
 *   GET  /api/shifts/swaps                   — list user's swap requests
 *   POST /api/shifts/:shiftId/swap-request   — request a shift swap
 *   POST /api/shifts/swaps/:swapId/accept    — accept a swap request
 *   POST /api/shifts/swaps/:swapId/decline   — decline a swap request
 *   GET  /api/shifts/venue/:venueId          — get venue roster (for swap target picker)
 */

import { create } from 'zustand'
import { apiClient } from '../lib/api'

// ---- Types ----

export interface Shift {
  id: string
  venueId: string
  userId: string
  startTime: string
  endTime: string
  roleLabel: string | null
  notes: string | null
  version: number
  lockedBySwapId: string | null
  createdAt: string
  updatedAt: string
  venueName?: string
  userName?: string
}

export type ShiftSwapStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'overridden'
  | 'expired'

export interface ShiftSwap {
  id: string
  shiftId: string
  requesterUserId: string
  targetUserId: string
  targetShiftId: string
  status: ShiftSwapStatus
  createdAt: string
  resolvedAt: string | null
  expiresAt: string
  requesterName?: string
  targetName?: string
  shift?: Shift
  targetShift?: Shift
}

// ---- Store ----

interface ShiftsState {
  shifts: Shift[]
  swaps: ShiftSwap[]
  venueShifts: Shift[]
  isLoadingShifts: boolean
  isLoadingSwaps: boolean
  isLoadingVenueShifts: boolean

  fetchMyShifts: () => Promise<void>
  fetchMySwaps: () => Promise<void>
  fetchVenueShifts: (venueId: string) => Promise<void>
  requestSwap: (
    shiftId: string,
    targetUserId: string,
    targetShiftId: string,
  ) => Promise<void>
  acceptSwap: (swapId: string) => Promise<void>
  declineSwap: (swapId: string) => Promise<void>
}

export const useShiftsStore = create<ShiftsState>((set, get) => ({
  shifts: [],
  swaps: [],
  venueShifts: [],
  isLoadingShifts: false,
  isLoadingSwaps: false,
  isLoadingVenueShifts: false,

  fetchMyShifts: async () => {
    set({ isLoadingShifts: true })
    try {
      const data = await apiClient.get<{ data: Shift[]; nextCursor?: string }>(
        '/shifts/my',
      )
      set({ shifts: data.data, isLoadingShifts: false })
    } catch {
      set({ isLoadingShifts: false })
    }
  },

  fetchMySwaps: async () => {
    set({ isLoadingSwaps: true })
    try {
      const data = await apiClient.get<{
        data: ShiftSwap[]
        nextCursor?: string
      }>('/shifts/swaps')
      set({ swaps: data.data, isLoadingSwaps: false })
    } catch {
      set({ isLoadingSwaps: false })
    }
  },

  fetchVenueShifts: async (venueId: string) => {
    set({ isLoadingVenueShifts: true })
    try {
      const data = await apiClient.get<{ data: Shift[] }>(
        `/shifts/venue/${venueId}`,
      )
      set({ venueShifts: data.data, isLoadingVenueShifts: false })
    } catch {
      set({ isLoadingVenueShifts: false })
    }
  },

  requestSwap: async (shiftId, targetUserId, targetShiftId) => {
    await apiClient.post(`/shifts/${shiftId}/swap-request`, {
      shiftId,
      targetUserId,
      targetShiftId,
    })
    // Refresh both lists
    await Promise.all([get().fetchMyShifts(), get().fetchMySwaps()])
  },

  acceptSwap: async (swapId) => {
    await apiClient.post(`/shifts/swaps/${swapId}/accept`)
    await Promise.all([get().fetchMyShifts(), get().fetchMySwaps()])
  },

  declineSwap: async (swapId) => {
    await apiClient.post(`/shifts/swaps/${swapId}/decline`)
    await get().fetchMySwaps()
  },
}))
