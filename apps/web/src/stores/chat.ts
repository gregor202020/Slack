import { create } from 'zustand'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import type { Socket } from 'socket.io-client'

export interface Message {
  id: string
  body: string
  userId: string
  channelId?: string
  dmId?: string
  parentMessageId?: string
  createdAt: string
  updatedAt: string
  isDeleted?: boolean
  threadReplyCount?: number
}

export interface Reaction {
  id: string
  messageId: string
  userId: string
  emoji: string
  createdAt: string
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

  // Thread state
  activeThreadId: string | null
  threadMessages: Message[]
  isLoadingThread: boolean

  // Reactions state
  reactions: Record<string, Reaction[]> // keyed by messageId

  // Unread counts state
  unreadCounts: Record<string, number> // keyed by channelId or dmId

  fetchChannels: () => Promise<void>
  fetchDms: () => Promise<void>
  fetchMessages: (channelId?: string, dmId?: string) => Promise<void>
  sendMessage: (body: string) => Promise<void>
  editMessage: (messageId: string, body: string) => Promise<void>
  deleteMessage: (messageId: string) => Promise<void>
  setActiveChannel: (channelId: string | null) => void
  setActiveDm: (dmId: string) => void

  // Thread actions
  openThread: (messageId: string) => Promise<void>
  closeThread: () => void
  sendThreadReply: (body: string) => Promise<void>
  fetchThread: (messageId: string) => Promise<void>

  // Reaction actions
  fetchReactions: (messageId: string) => Promise<void>
  addReaction: (messageId: string, emoji: string) => Promise<void>
  removeReaction: (messageId: string, emoji: string) => Promise<void>

  // Unread actions
  fetchUnreadCounts: () => Promise<void>
  markAsRead: (channelId?: string, dmId?: string) => Promise<void>
}

const typingTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}

function getTypingKey(roomKey: string, userId: string) {
  return `${roomKey}:${userId}`
}

export function setupSocketListeners(socket: Socket): () => void {
  const { getState: get, setState: set } = useChatStore

  const onMessageNew = (msg: Message) => {
    const { activeChannelId, activeDmId, messages, activeThreadId, threadMessages } = get()

    // If this is a thread reply, route to thread panel if active
    if (msg.parentMessageId) {
      if (msg.parentMessageId === activeThreadId) {
        if (threadMessages.some((m) => m.id === msg.id)) return
        set({ threadMessages: [...threadMessages, msg] })
      }

      // Also bump the reply count on the parent message in the main list
      set({
        messages: get().messages.map((m) =>
          m.id === msg.parentMessageId
            ? { ...m, threadReplyCount: (m.threadReplyCount ?? 0) + 1 }
            : m,
        ),
      })
      return
    }

    // Normal channel/DM message
    if (msg.channelId === activeChannelId || msg.dmId === activeDmId) {
      if (messages.some((m) => m.id === msg.id)) return
      set({ messages: [...messages, msg] })
    } else {
      // Message is for a channel/DM that is NOT currently active — increment unread
      const targetId = msg.channelId || msg.dmId
      if (targetId) {
        const { unreadCounts } = get()
        set({
          unreadCounts: {
            ...unreadCounts,
            [targetId]: (unreadCounts[targetId] ?? 0) + 1,
          },
        })
      }
    }
  }

  const onMessageEdited = (data: { messageId: string; body: string; editedAt: string }) => {
    set({
      messages: get().messages.map((m) =>
        m.id === data.messageId ? { ...m, body: data.body, updatedAt: data.editedAt } : m,
      ),
    })
    // Also update thread messages if thread is open
    const { activeThreadId, threadMessages } = get()
    if (activeThreadId) {
      set({
        threadMessages: threadMessages.map((m) =>
          m.id === data.messageId ? { ...m, body: data.body, updatedAt: data.editedAt } : m,
        ),
      })
    }
  }

  const onMessageDeleted = (data: { messageId: string }) => {
    set({
      messages: get().messages.filter((m) => m.id !== data.messageId),
    })
    // Also remove from thread if open
    const { activeThreadId, threadMessages } = get()
    if (activeThreadId) {
      set({
        threadMessages: threadMessages.filter((m) => m.id !== data.messageId),
      })
    }
  }

  const onReactionAdded = (reaction: Reaction) => {
    const { reactions } = get()
    const existing = reactions[reaction.messageId] ?? []
    if (existing.some((r) => r.id === reaction.id)) return
    set({
      reactions: {
        ...reactions,
        [reaction.messageId]: [...existing, reaction],
      },
    })
  }

  const onReactionRemoved = (data: { reactionId: string; messageId: string }) => {
    const { reactions } = get()
    const existing = reactions[data.messageId] ?? []
    set({
      reactions: {
        ...reactions,
        [data.messageId]: existing.filter((r) => r.id !== data.reactionId),
      },
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
  socket.on('reaction:added', onReactionAdded)
  socket.on('reaction:removed', onReactionRemoved)
  socket.on('typing:start', onTypingStart)
  socket.on('typing:stop', onTypingStop)

  // Return cleanup function
  return () => {
    socket.off('message:new', onMessageNew)
    socket.off('message:edited', onMessageEdited)
    socket.off('message:deleted', onMessageDeleted)
    socket.off('reaction:added', onReactionAdded)
    socket.off('reaction:removed', onReactionRemoved)
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

  // Thread state
  activeThreadId: null,
  threadMessages: [],
  isLoadingThread: false,

  // Reactions state
  reactions: {},

  // Unread counts state
  unreadCounts: {},

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

  editMessage: async (messageId: string, body: string) => {
    await api(`/api/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    })
    // Optimistic update
    set({
      messages: get().messages.map((m) =>
        m.id === messageId ? { ...m, body, updatedAt: new Date().toISOString() } : m,
      ),
    })
  },

  deleteMessage: async (messageId: string) => {
    await api(`/api/messages/${messageId}`, {
      method: 'DELETE',
    })
    // Optimistic update
    set({
      messages: get().messages.filter((m) => m.id !== messageId),
    })
  },

  setActiveChannel: (channelId: string | null) => {
    set({ activeChannelId: channelId, activeDmId: null, messages: [], activeThreadId: null, threadMessages: [], reactions: {} })
    if (channelId) {
      get().fetchMessages(channelId)
      get().markAsRead(channelId)
    }
  },

  setActiveDm: (dmId: string) => {
    set({ activeDmId: dmId, activeChannelId: null, messages: [], activeThreadId: null, threadMessages: [], reactions: {} })
    get().fetchMessages(undefined, dmId)
    get().markAsRead(undefined, dmId)
  },

  // Thread actions
  openThread: async (messageId: string) => {
    set({ activeThreadId: messageId, threadMessages: [], isLoadingThread: true })
    await get().fetchThread(messageId)
  },

  closeThread: () => {
    set({ activeThreadId: null, threadMessages: [], isLoadingThread: false })
  },

  fetchThread: async (messageId: string) => {
    set({ isLoadingThread: true })
    try {
      const data = await api<{ messages: Message[] }>(`/api/messages/${messageId}/thread`)
      set({ threadMessages: data.messages || [], isLoadingThread: false })
    } catch {
      set({ threadMessages: [], isLoadingThread: false })
    }
  },

  sendThreadReply: async (body: string) => {
    const { activeThreadId } = get()
    if (!activeThreadId) return
    await api(`/api/messages/${activeThreadId}/thread`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
  },

  // Reaction actions
  fetchReactions: async (messageId: string) => {
    try {
      const data = await api<Reaction[]>(`/api/reactions/message/${messageId}`)
      set((state) => ({
        reactions: { ...state.reactions, [messageId]: data },
      }))
    } catch {
      // Silently fail
    }
  },

  addReaction: async (messageId: string, emoji: string) => {
    try {
      await api('/api/reactions', {
        method: 'POST',
        body: JSON.stringify({ messageId, emoji }),
      })
    } catch {
      // Silently fail — optimistic update will be corrected by socket
    }
  },

  removeReaction: async (messageId: string, emoji: string) => {
    // Find the reaction to remove (current user's reaction with this emoji)
    const { reactions } = get()
    const messageReactions = reactions[messageId] ?? []
    // We need the current user's ID — we'll pass it from the component
    // For now, find by emoji and let the API validate ownership
    const reaction = messageReactions.find((r) => r.emoji === emoji)
    if (!reaction) return

    try {
      await api(`/api/reactions/${reaction.id}`, {
        method: 'DELETE',
      })
    } catch {
      // Silently fail
    }
  },

  // Unread actions
  fetchUnreadCounts: async () => {
    try {
      const data = await api<{ channels: Record<string, number>; dms: Record<string, number>; total: number }>('/api/unread')
      set({ unreadCounts: { ...data.channels, ...data.dms } })
    } catch {
      // Silently fail
    }
  },

  markAsRead: async (channelId?: string, dmId?: string) => {
    if (!channelId && !dmId) return

    // Optimistically reset the count
    const targetId = channelId || dmId
    if (targetId) {
      set((state) => ({
        unreadCounts: { ...state.unreadCounts, [targetId]: 0 },
      }))
    }

    try {
      await api('/api/unread/read', {
        method: 'POST',
        body: JSON.stringify({ channelId, dmId }),
      })
    } catch {
      // Silently fail — the optimistic update stays
    }
  },
}))
