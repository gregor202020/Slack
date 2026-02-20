/**
 * Venues store — manages venue data for pickers and selectors.
 *
 * API endpoints used:
 *   GET /api/venues — list all venues
 */

import { create } from 'zustand'
import { apiClient } from '../lib/api'

// ---- Types ----

export interface Venue {
  id: string
  name: string
  address: string
  status: 'active' | 'archived'
  createdBy: string
  createdAt: string
}

// ---- Store ----

interface VenuesState {
  venues: Venue[]
  isLoading: boolean

  fetchVenues: () => Promise<void>
}

export const useVenuesStore = create<VenuesState>((set) => ({
  venues: [],
  isLoading: false,

  fetchVenues: async () => {
    set({ isLoading: true })
    try {
      const data = await apiClient.get<{ data: Venue[] }>('/venues')
      set({ venues: data.data, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },
}))
