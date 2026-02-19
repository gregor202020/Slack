import { create } from 'zustand'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

interface Message {
  id: string
  body: string
  userId: string
  channelId?: string
  dmId?: string
  parentMessageId?: string
  createdAt: string
  updatedAt: string
  isDeleted?: boolean
}

interface Channel {
  id: string
  name: string
  type: string
  scope: string
  topic?: string
  description?: string
  venueId?: string
}

interface Dm {
  id: string
  type: string
  createdAt: string
}

interface ChatState {
  channels: Channel[]
  dms: Dm[]
  messages: Message[]
  activeChannelId: string | null
  activeDmId: string | null
  typingUsers: Record<string, string[]>
  isLoadingMessages: boolean

  fetchChannels: () => Promise<void>
  fetchDms: () => Promise<void>
  fetchMessages: (channelId?: string, dmId?: string) => Promise<void>
  sendMessage: (body: string) => Promise<void>
  setActiveChannel: (channelId: string) => void
  setActiveDm: (dmId: string) => void
  setupSocketListeners: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  dms: [],
  messages: [],
  activeChannelId: null,
  activeDmId: null,
  typingUsers: {},
  isLoadingMessages: false,

  fetchChannels: async () => {
    const data = await api<{ data: Channel[] }>('/api/channels')
    set({ channels: data.data || [] })
  },

  fetchDms: async () => {
    const data = await api<{ data: Dm[] }>('/api/dms')
    set({ dms: data.data || [] })
  },

  fetchMessages: async (channelId?: string, dmId?: string) => {
    set({ isLoadingMessages: true })
    try {
      let data: { data: Message[] }
      if (channelId) {
        data = await api<{ data: Message[] }>(`/api/messages/channel/${channelId}`)
      } else if (dmId) {
        data = await api<{ data: Message[] }>(`/api/dms/${dmId}/messages`)
      } else {
        set({ messages: [], isLoadingMessages: false })
        return
      }
      set({ messages: data.data || [], isLoadingMessages: false })
    } catch {
      set({ messages: [], isLoadingMessages: false })
    }
  },

  sendMessage: async (body: string) => {
    const { activeChannelId, activeDmId } = get()
    if (activeChannelId) {
      await api(`/api/messages/channel/${activeChannelId}`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
    } else if (activeDmId) {
      await api(`/api/messages/dm/${activeDmId}`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
    }
  },

  setActiveChannel: (channelId: string) => {
    set({ activeChannelId: channelId, activeDmId: null, messages: [] })
    get().fetchMessages(channelId)
  },

  setActiveDm: (dmId: string) => {
    set({ activeDmId: dmId, activeChannelId: null, messages: [] })
    get().fetchMessages(undefined, dmId)
  },

  setupSocketListeners: () => {
    const socket = getSocket()

    socket.on('message:new', (msg: Message) => {
      const { activeChannelId, activeDmId } = get()
      if (msg.channelId === activeChannelId || msg.dmId === activeDmId) {
        set((state) => ({ messages: [...state.messages, msg] }))
      }
    })

    socket.on('message:edited', (data: { messageId: string; body: string; editedAt: string }) => {
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === data.messageId ? { ...m, body: data.body, updatedAt: data.editedAt } : m,
        ),
      }))
    })

    socket.on('message:deleted', (data: { messageId: string }) => {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== data.messageId),
      }))
    })

    socket.on('typing:start', (data: { userId: string; channelId?: string; dmId?: string }) => {
      const roomKey = data.channelId || data.dmId || ''
      set((state) => {
        const current = state.typingUsers[roomKey] || []
        if (current.includes(data.userId)) return state
        return { typingUsers: { ...state.typingUsers, [roomKey]: [...current, data.userId] } }
      })
    })

    socket.on('typing:stop', (data: { userId: string; channelId?: string; dmId?: string }) => {
      const roomKey = data.channelId || data.dmId || ''
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [roomKey]: (state.typingUsers[roomKey] || []).filter((u) => u !== data.userId),
        },
      }))
    })
  },
}))
