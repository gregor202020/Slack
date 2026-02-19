import { create } from 'zustand'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import type { Socket } from 'socket.io-client'

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
  setActiveChannel: (channelId: string | null) => void
  setActiveDm: (dmId: string) => void
}

const typingTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}

function getTypingKey(roomKey: string, userId: string) {
  return `${roomKey}:${userId}`
}

export function setupSocketListeners(socket: Socket): () => void {
  const { getState: get, setState: set } = useChatStore

  const onMessageNew = (msg: Message) => {
    const { activeChannelId, activeDmId, messages } = get()
    if (msg.channelId === activeChannelId || msg.dmId === activeDmId) {
      // Deduplicate: skip if message already exists
      if (messages.some((m) => m.id === msg.id)) return
      set({ messages: [...messages, msg] })
    }
  }

  const onMessageEdited = (data: { messageId: string; body: string; editedAt: string }) => {
    set({
      messages: get().messages.map((m) =>
        m.id === data.messageId ? { ...m, body: data.body, updatedAt: data.editedAt } : m,
      ),
    })
  }

  const onMessageDeleted = (data: { messageId: string }) => {
    set({
      messages: get().messages.filter((m) => m.id !== data.messageId),
    })
  }

  const removeTypingUser = (roomKey: string, userId: string) => {
    const key = getTypingKey(roomKey, userId)
    if (typingTimeouts[key]) {
      clearTimeout(typingTimeouts[key])
      delete typingTimeouts[key]
    }
    const state = get()
    set({
      typingUsers: {
        ...state.typingUsers,
        [roomKey]: (state.typingUsers[roomKey] || []).filter((u) => u !== userId),
      },
    })
  }

  const onTypingStart = (data: { userId: string; channelId?: string; dmId?: string }) => {
    const roomKey = data.channelId || data.dmId || ''
    const state = get()
    const current = state.typingUsers[roomKey] || []
    const key = getTypingKey(roomKey, data.userId)

    // Clear any existing timeout for this user
    if (typingTimeouts[key]) {
      clearTimeout(typingTimeouts[key])
    }

    if (!current.includes(data.userId)) {
      set({ typingUsers: { ...state.typingUsers, [roomKey]: [...current, data.userId] } })
    }

    // Auto-expire after 5 seconds
    typingTimeouts[key] = setTimeout(() => {
      removeTypingUser(roomKey, data.userId)
    }, 5000)
  }

  const onTypingStop = (data: { userId: string; channelId?: string; dmId?: string }) => {
    const roomKey = data.channelId || data.dmId || ''
    removeTypingUser(roomKey, data.userId)
  }

  socket.on('message:new', onMessageNew)
  socket.on('message:edited', onMessageEdited)
  socket.on('message:deleted', onMessageDeleted)
  socket.on('typing:start', onTypingStart)
  socket.on('typing:stop', onTypingStop)

  // Return cleanup function
  return () => {
    socket.off('message:new', onMessageNew)
    socket.off('message:edited', onMessageEdited)
    socket.off('message:deleted', onMessageDeleted)
    socket.off('typing:start', onTypingStart)
    socket.off('typing:stop', onTypingStop)

    // Clear all typing timeouts
    for (const key of Object.keys(typingTimeouts)) {
      clearTimeout(typingTimeouts[key])
      delete typingTimeouts[key]
    }
  }
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

  setActiveChannel: (channelId: string | null) => {
    set({ activeChannelId: channelId, activeDmId: null, messages: [] })
    if (channelId) {
      get().fetchMessages(channelId)
    }
  },

  setActiveDm: (dmId: string) => {
    set({ activeDmId: dmId, activeChannelId: null, messages: [] })
    get().fetchMessages(undefined, dmId)
  },
}))
