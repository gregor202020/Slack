/**
 * Announcements store — manages announcements and acknowledgments.
 *
 * API endpoints used:
 *   GET  /api/announcements                        — list announcements
 *   POST /api/announcements/:id/acknowledge         — acknowledge
 *   GET  /api/announcements/pending                 — pending ack-required
 */

import { create } from 'zustand'
import { apiClient } from '../lib/api'

// ---- Types ----

export type AnnouncementScope = 'system' | 'venue' | 'channel'

export interface Announcement {
  id: string
  userId: string
  scope: AnnouncementScope
  venueId: string | null
  channelId: string | null
  title: string
  body: string
  ackRequired: boolean
  locked: boolean
  createdAt: string
  updatedAt: string
  authorName?: string
  ackCount?: number
  totalRecipients?: number
  userAcked?: boolean
}

// ---- Store ----

interface AnnouncementsState {
  announcements: Announcement[]
  isLoading: boolean
  isAcknowledging: Record<string, boolean>

  fetchAnnouncements: () => Promise<void>
  acknowledgeAnnouncement: (announcementId: string) => Promise<void>
}

export const useAnnouncementsStore = create<AnnouncementsState>((set, get) => ({
  announcements: [],
  isLoading: false,
  isAcknowledging: {},

  fetchAnnouncements: async () => {
    set({ isLoading: true })
    try {
      const data = await apiClient.get<{
        data: Announcement[]
        nextCursor?: string
      }>('/announcements')
      set({ announcements: data.data, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },

  acknowledgeAnnouncement: async (announcementId: string) => {
    set((state) => ({
      isAcknowledging: { ...state.isAcknowledging, [announcementId]: true },
    }))
    try {
      await apiClient.post(`/announcements/${announcementId}/acknowledge`)
      // Update local state to reflect ack
      set((state) => ({
        announcements: state.announcements.map((a) =>
          a.id === announcementId
            ? {
                ...a,
                userAcked: true,
                ackCount: (a.ackCount ?? 0) + 1,
              }
            : a,
        ),
        isAcknowledging: {
          ...state.isAcknowledging,
          [announcementId]: false,
        },
      }))
    } catch {
      set((state) => ({
        isAcknowledging: {
          ...state.isAcknowledging,
          [announcementId]: false,
        },
      }))
      throw new Error('Failed to acknowledge announcement')
    }
  },
}))
