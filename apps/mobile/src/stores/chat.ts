/**
 * Chat store — channels, DMs, messages, threads, reactions, and real-time socket listeners.
 *
 * API endpoints used:
 *   GET  /api/channels                         — list channels
 *   GET  /api/dms                              — list DMs
 *   GET  /api/messages/channel/:channelId      — channel messages
 *   GET  /api/messages/dm/:dmId                — DM messages
 *   POST /api/messages/channel/:channelId      — send channel message
 *   POST /api/messages/dm/:dmId                — send DM message
 *   GET  /api/messages/:messageId/thread       — get thread replies
 *   POST /api/messages/:messageId/thread       — send thread reply
 *   POST /api/reactions                        — add reaction
 *   DELETE /api/reactions/:reactionId           — remove reaction
 *   GET  /api/reactions/message/:messageId      — list reactions
 *
 * Socket events listened:
 *   message:created, message:updated, message:deleted
 *   reaction:added, reaction:removed
 *   typing:start, typing:stop
 *   presence:online, presence:offline
 */

import { create } from 'zustand'
import { apiClient } from '../lib/api'
import { getSocket } from '../lib/socket'

// ---- Types ----

export interface Channel {
  id: string
  name: string
  type: 'public' | 'private'
  scope: string
  topic: string | null
  description: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  createdAt: string
}

export interface DmConversation {
  id: string
  type: 'direct' | 'group'
  members: DmMember[]
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
  createdAt: string
}

export interface DmMember {
  userId: string
  fullName: string | null
  displayName: string | null
  avatarUrl: string | null
}

export interface Message {
  id: string
  body: string
  channelId: string | null
  dmId: string | null
  senderId: string
  senderName: string | null
  senderAvatarUrl: string | null
  parentMessageId: string | null
  createdAt: string
  updatedAt: string | null
  deletedAt: string | null
  threadReplyCount?: number
}

export interface Reaction {
  id: string
  messageId: string
  userId: string
  emoji: string
  createdAt: string
}

interface TypingUser {
  userId: string
  timestamp: number
}

// ---- Store ----

interface ChatState {
  channels: Channel[]
  dms: DmConversation[]
  messages: Record<string, Message[]> // keyed by channelId or dmId
  activeChannelId: string | null
  activeDmId: string | null
  typingUsers: Record<string, TypingUser[]> // keyed by channelId or dmId
  isLoadingChannels: boolean
  isLoadingDms: boolean
  isLoadingMessages: boolean
  hasMoreMessages: Record<string, boolean>
  cursors: Record<string, string | undefined>

  // Thread state
  activeThreadId: string | null
  threadMessages: Message[]
  isLoadingThread: boolean

  // Reactions state
  reactions: Record<string, Reaction[]> // keyed by messageId

  fetchChannels: () => Promise<void>
  fetchDms: () => Promise<void>
  fetchMessages: (targetId: string, type: 'channel' | 'dm') => Promise<void>
  fetchMoreMessages: (targetId: string, type: 'channel' | 'dm') => Promise<void>
  sendMessage: (
    targetId: string,
    type: 'channel' | 'dm',
    body: string,
    parentMessageId?: string,
  ) => Promise<void>
  setActiveChannel: (channelId: string | null) => void
  setActiveDm: (dmId: string | null) => void
  setupSocketListeners: () => () => void
  emitTyping: (targetId: string, type: 'channel' | 'dm', isTyping: boolean) => void

  // Thread actions
  openThread: (messageId: string) => Promise<void>
  closeThread: () => void
  fetchThread: (messageId: string) => Promise<void>
  sendThreadReply: (messageId: string, body: string) => Promise<void>

  // Reaction actions
  fetchReactions: (messageId: string) => Promise<void>
  addReaction: (messageId: string, emoji: string) => Promise<void>
  removeReaction: (messageId: string, emoji: string, userId: string) => Promise<void>
}

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  dms: [],
  messages: {},
  activeChannelId: null,
  activeDmId: null,
  typingUsers: {},
  isLoadingChannels: false,
  isLoadingDms: false,
  isLoadingMessages: false,
  hasMoreMessages: {},
  cursors: {},

  // Thread state
  activeThreadId: null,
  threadMessages: [],
  isLoadingThread: false,

  // Reactions state
  reactions: {},

  fetchChannels: async () => {
    set({ isLoadingChannels: true })
    try {
      const data = await apiClient.get<{ data: Channel[]; nextCursor?: string }>(
        '/channels',
      )
      set({ channels: data.data, isLoadingChannels: false })
    } catch {
      set({ isLoadingChannels: false })
    }
  },

  fetchDms: async () => {
    set({ isLoadingDms: true })
    try {
      const data = await apiClient.get<{ data: DmConversation[]; nextCursor?: string }>(
        '/dms',
      )
      set({ dms: data.data, isLoadingDms: false })
    } catch {
      set({ isLoadingDms: false })
    }
  },

  fetchMessages: async (targetId, type) => {
    set({ isLoadingMessages: true })
    const path =
      type === 'channel'
        ? `/messages/channel/${targetId}`
        : `/messages/dm/${targetId}`

    try {
      const data = await apiClient.get<{
        data: Message[]
        nextCursor?: string
      }>(path, { params: { limit: 50 } })

      set((state) => ({
        messages: { ...state.messages, [targetId]: data.data },
        cursors: { ...state.cursors, [targetId]: data.nextCursor },
        hasMoreMessages: {
          ...state.hasMoreMessages,
          [targetId]: !!data.nextCursor,
        },
        isLoadingMessages: false,
      }))
    } catch {
      set({ isLoadingMessages: false })
    }
  },

  fetchMoreMessages: async (targetId, type) => {
    const { cursors, hasMoreMessages } = get()
    if (!hasMoreMessages[targetId]) return

    const cursor = cursors[targetId]
    const path =
      type === 'channel'
        ? `/messages/channel/${targetId}`
        : `/messages/dm/${targetId}`

    try {
      const data = await apiClient.get<{
        data: Message[]
        nextCursor?: string
      }>(path, { params: { limit: 50, cursor } })

      set((state) => ({
        messages: {
          ...state.messages,
          [targetId]: [...(state.messages[targetId] ?? []), ...data.data],
        },
        cursors: { ...state.cursors, [targetId]: data.nextCursor },
        hasMoreMessages: {
          ...state.hasMoreMessages,
          [targetId]: !!data.nextCursor,
        },
      }))
    } catch {
      // Silently fail — user can retry
    }
  },

  sendMessage: async (targetId, type, body, parentMessageId) => {
    const path =
      type === 'channel'
        ? `/messages/channel/${targetId}`
        : `/messages/dm/${targetId}`

    const payload: { body: string; parentMessageId?: string } = { body }
    if (parentMessageId) payload.parentMessageId = parentMessageId

    const message = await apiClient.post<Message>(path, payload)

    // Optimistically prepend the new message
    set((state) => ({
      messages: {
        ...state.messages,
        [targetId]: [message, ...(state.messages[targetId] ?? [])],
      },
    }))
  },

  setActiveChannel: (channelId) => set({ activeChannelId: channelId }),
  setActiveDm: (dmId) => set({ activeDmId: dmId }),

  emitTyping: (targetId, type, isTyping) => {
    const socket = getSocket()
    if (!socket) return

    const event = isTyping ? 'typing:start' : 'typing:stop'
    const payload =
      type === 'channel' ? { channelId: targetId } : { dmId: targetId }
    socket.emit(event, payload)
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
      const data = await apiClient.get<{ messages: Message[] }>(
        `/messages/${messageId}/thread`,
      )
      set({ threadMessages: data.messages ?? [], isLoadingThread: false })
    } catch {
      set({ threadMessages: [], isLoadingThread: false })
    }
  },

  sendThreadReply: async (messageId: string, body: string) => {
    const reply = await apiClient.post<Message>(
      `/messages/${messageId}/thread`,
      { body },
    )

    // Optimistically add to thread messages
    set((state) => ({
      threadMessages: [...state.threadMessages, reply],
    }))
  },

  // Reaction actions
  fetchReactions: async (messageId: string) => {
    try {
      const data = await apiClient.get<Reaction[]>(
        `/reactions/message/${messageId}`,
      )
      set((state) => ({
        reactions: { ...state.reactions, [messageId]: data },
      }))
    } catch {
      // Silently fail
    }
  },

  addReaction: async (messageId: string, emoji: string) => {
    try {
      await apiClient.post('/reactions', { messageId, emoji })
    } catch {
      // Silently fail — socket will sync
    }
  },

  removeReaction: async (messageId: string, emoji: string, userId: string) => {
    const { reactions } = get()
    const messageReactions = reactions[messageId] ?? []
    const reaction = messageReactions.find(
      (r) => r.emoji === emoji && r.userId === userId,
    )
    if (!reaction) return

    try {
      await apiClient.delete(`/reactions/${reaction.id}`)
    } catch {
      // Silently fail
    }
  },

  setupSocketListeners: () => {
    const socket = getSocket()
    if (!socket) return () => {}

    const onMessageCreated = (message: Message) => {
      const targetId = message.channelId ?? message.dmId
      if (!targetId) return

      // If this is a thread reply, route to thread if active
      if (message.parentMessageId) {
        const { activeThreadId, threadMessages } = get()
        if (message.parentMessageId === activeThreadId) {
          if (!threadMessages.some((m) => m.id === message.id)) {
            set({ threadMessages: [...threadMessages, message] })
          }
        }

        // Bump reply count on parent in main list
        set((state) => {
          const existing = state.messages[targetId] ?? []
          return {
            messages: {
              ...state.messages,
              [targetId]: existing.map((m) =>
                m.id === message.parentMessageId
                  ? { ...m, threadReplyCount: (m.threadReplyCount ?? 0) + 1 }
                  : m,
              ),
            },
          }
        })
        return
      }

      set((state) => {
        const existing = state.messages[targetId] ?? []
        // Avoid duplicates
        if (existing.some((m) => m.id === message.id)) return state

        return {
          messages: {
            ...state.messages,
            [targetId]: [message, ...existing],
          },
        }
      })

      // Update channel/DM last message preview
      const { channels, dms } = get()
      if (message.channelId) {
        set({
          channels: channels.map((ch) =>
            ch.id === message.channelId
              ? {
                  ...ch,
                  lastMessageAt: message.createdAt,
                  lastMessagePreview: message.body.slice(0, 100),
                  unreadCount:
                    ch.id === get().activeChannelId
                      ? ch.unreadCount
                      : ch.unreadCount + 1,
                }
              : ch,
          ),
        })
      } else if (message.dmId) {
        set({
          dms: dms.map((dm) =>
            dm.id === message.dmId
              ? {
                  ...dm,
                  lastMessageAt: message.createdAt,
                  lastMessagePreview: message.body.slice(0, 100),
                  unreadCount:
                    dm.id === get().activeDmId
                      ? dm.unreadCount
                      : dm.unreadCount + 1,
                }
              : dm,
          ),
        })
      }
    }

    const onMessageUpdated = (message: Message) => {
      const targetId = message.channelId ?? message.dmId
      if (!targetId) return

      set((state) => ({
        messages: {
          ...state.messages,
          [targetId]: (state.messages[targetId] ?? []).map((m) =>
            m.id === message.id ? message : m,
          ),
        },
      }))

      // Also update thread messages if open
      const { activeThreadId, threadMessages } = get()
      if (activeThreadId) {
        set({
          threadMessages: threadMessages.map((m) =>
            m.id === message.id ? message : m,
          ),
        })
      }
    }

    const onMessageDeleted = (data: { messageId: string; channelId?: string; dmId?: string }) => {
      const targetId = data.channelId ?? data.dmId
      if (!targetId) return

      set((state) => ({
        messages: {
          ...state.messages,
          [targetId]: (state.messages[targetId] ?? []).filter(
            (m) => m.id !== data.messageId,
          ),
        },
      }))

      // Also remove from thread if open
      const { activeThreadId, threadMessages } = get()
      if (activeThreadId) {
        set({
          threadMessages: threadMessages.filter((m) => m.id !== data.messageId),
        })
      }
    }

    const onReactionAdded = (reaction: Reaction) => {
      set((state) => {
        const existing = state.reactions[reaction.messageId] ?? []
        if (existing.some((r) => r.id === reaction.id)) return state
        return {
          reactions: {
            ...state.reactions,
            [reaction.messageId]: [...existing, reaction],
          },
        }
      })
    }

    const onReactionRemoved = (data: { reactionId: string; messageId: string }) => {
      set((state) => {
        const existing = state.reactions[data.messageId] ?? []
        return {
          reactions: {
            ...state.reactions,
            [data.messageId]: existing.filter((r) => r.id !== data.reactionId),
          },
        }
      })
    }

    const onTypingStart = (data: { userId: string; channelId?: string; dmId?: string }) => {
      const targetId = data.channelId ?? data.dmId
      if (!targetId) return

      set((state) => {
        const current = state.typingUsers[targetId] ?? []
        // Replace or add
        const filtered = current.filter((t) => t.userId !== data.userId)
        return {
          typingUsers: {
            ...state.typingUsers,
            [targetId]: [...filtered, { userId: data.userId, timestamp: Date.now() }],
          },
        }
      })
    }

    const onTypingStop = (data: { userId: string; channelId?: string; dmId?: string }) => {
      const targetId = data.channelId ?? data.dmId
      if (!targetId) return

      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [targetId]: (state.typingUsers[targetId] ?? []).filter(
            (t) => t.userId !== data.userId,
          ),
        },
      }))
    }

    socket.on('message:created', onMessageCreated)
    socket.on('message:updated', onMessageUpdated)
    socket.on('message:deleted', onMessageDeleted)
    socket.on('reaction:added', onReactionAdded)
    socket.on('reaction:removed', onReactionRemoved)
    socket.on('typing:start', onTypingStart)
    socket.on('typing:stop', onTypingStop)

    return () => {
      socket.off('message:created', onMessageCreated)
      socket.off('message:updated', onMessageUpdated)
      socket.off('message:deleted', onMessageDeleted)
      socket.off('reaction:added', onReactionAdded)
      socket.off('reaction:removed', onReactionRemoved)
      socket.off('typing:start', onTypingStart)
      socket.off('typing:stop', onTypingStop)
    }
  },
}))
