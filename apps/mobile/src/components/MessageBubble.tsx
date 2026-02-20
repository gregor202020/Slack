/**
 * MessageBubble — chat message with sender info, timestamp, content,
 * long-press context menu (thread + quick reactions), reaction pills,
 * and thread reply count badge.
 *
 * Own messages: right-aligned, brand blue background, white text.
 * Others' messages: left-aligned, light gray background, dark text.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from 'react-native'
import { Avatar } from './Avatar'
import { ReactionPills } from './ReactionPills'
import { colors } from '../theme/colors'
import { fontSize, fontWeight } from '../theme/typography'
import { useChatStore, type Reaction } from '../stores/chat'
import { useAuthStore } from '../stores/auth'

const QUICK_EMOJIS = [
  '\u{1F44D}', // thumbs up
  '\u{2764}\u{FE0F}', // red heart
  '\u{1F602}', // face with tears of joy
  '\u{1F525}', // fire
  '\u{1F440}', // eyes
  '\u{1F389}', // party popper
  '\u{2705}', // check mark
  '\u{274C}', // cross mark
]

interface MessageBubbleProps {
  messageId: string
  body: string
  senderId: string
  senderName: string | null
  senderAvatarUrl: string | null
  createdAt: string
  isOwnMessage: boolean
  showSender?: boolean
  threadReplyCount?: number
  onReplyInThread?: (messageId: string) => void
  isThreadView?: boolean
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function MessageBubble({
  messageId,
  body,
  senderId,
  senderName,
  senderAvatarUrl,
  createdAt,
  isOwnMessage,
  showSender = true,
  threadReplyCount = 0,
  onReplyInThread,
  isThreadView = false,
}: MessageBubbleProps) {
  const [showContextMenu, setShowContextMenu] = useState(false)
  const currentUserId = useAuthStore((s) => s.user?.id)
  const reactions = useChatStore((s) => s.reactions[messageId] ?? [])
  const fetchReactions = useChatStore((s) => s.fetchReactions)
  const addReaction = useChatStore((s) => s.addReaction)
  const removeReaction = useChatStore((s) => s.removeReaction)
  const hasFetchedReactions = useRef(false)

  // Fetch reactions on first render
  useEffect(() => {
    if (!hasFetchedReactions.current) {
      hasFetchedReactions.current = true
      fetchReactions(messageId)
    }
  }, [messageId, fetchReactions])

  const handleLongPress = useCallback(() => {
    setShowContextMenu(true)
  }, [])

  const handleQuickReact = useCallback((emoji: string) => {
    addReaction(messageId, emoji)
    setShowContextMenu(false)
  }, [messageId, addReaction])

  const handleReplyInThread = useCallback(() => {
    setShowContextMenu(false)
    onReplyInThread?.(messageId)
  }, [messageId, onReplyInThread])

  const handleReactionToggle = useCallback((emoji: string) => {
    if (!currentUserId) return
    const userReaction = reactions.find(
      (r: Reaction) => r.emoji === emoji && r.userId === currentUserId,
    )
    if (userReaction) {
      removeReaction(messageId, emoji, currentUserId)
    } else {
      addReaction(messageId, emoji)
    }
  }, [messageId, reactions, currentUserId, addReaction, removeReaction])

  return (
    <>
      <Pressable
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        <View
          style={[
            styles.container,
            isOwnMessage ? styles.containerRight : styles.containerLeft,
          ]}
        >
          {!isOwnMessage && showSender && (
            <View style={styles.avatarColumn}>
              <Avatar
                imageUrl={senderAvatarUrl}
                name={senderName}
                size={32}
              />
            </View>
          )}

          <View style={styles.contentColumn}>
            {!isOwnMessage && showSender && senderName && (
              <Text style={styles.senderName}>{senderName}</Text>
            )}

            <View
              style={[
                styles.bubble,
                isOwnMessage ? styles.bubbleOwn : styles.bubbleOther,
              ]}
            >
              <Text
                style={[
                  styles.body,
                  isOwnMessage ? styles.bodyOwn : styles.bodyOther,
                ]}
              >
                {body}
              </Text>
            </View>

            {/* Reaction pills */}
            {reactions.length > 0 && (
              <ReactionPills
                reactions={reactions}
                currentUserId={currentUserId}
                onToggle={handleReactionToggle}
              />
            )}

            {/* Thread reply count badge */}
            {!isThreadView && threadReplyCount > 0 && (
              <Pressable
                onPress={() => onReplyInThread?.(messageId)}
                style={styles.threadBadge}
              >
                <Text style={styles.threadBadgeText}>
                  {threadReplyCount} {threadReplyCount === 1 ? 'reply' : 'replies'}
                </Text>
              </Pressable>
            )}

            <Text
              style={[
                styles.timestamp,
                isOwnMessage ? styles.timestampRight : styles.timestampLeft,
              ]}
            >
              {formatTime(createdAt)}
            </Text>
          </View>

          {/* Spacer for own messages to maintain alignment */}
          {isOwnMessage && showSender && <View style={styles.avatarColumn} />}
        </View>
      </Pressable>

      {/* Context menu modal */}
      <Modal
        visible={showContextMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowContextMenu(false)}
      >
        <Pressable
          style={styles.overlay}
          onPress={() => setShowContextMenu(false)}
        >
          <View style={styles.contextMenu}>
            {/* Quick-react emoji row */}
            <View style={styles.emojiRow}>
              {QUICK_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  onPress={() => handleQuickReact(emoji)}
                  style={styles.emojiButton}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>

            {/* Divider */}
            <View style={styles.divider} />

            {/* Reply in thread option */}
            {!isThreadView && (
              <Pressable
                onPress={handleReplyInThread}
                style={styles.menuItem}
              >
                <Text style={styles.menuItemText}>Reply in Thread</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: 2,
    paddingHorizontal: 12,
  },
  containerLeft: {
    justifyContent: 'flex-start',
  },
  containerRight: {
    justifyContent: 'flex-end',
  },
  avatarColumn: {
    width: 36,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  contentColumn: {
    maxWidth: '75%',
    flexShrink: 1,
  },
  senderName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: 2,
    marginLeft: 4,
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: colors.brand[500],
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.smoke[100],
    borderBottomLeftRadius: 4,
  },
  body: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  bodyOwn: {
    color: colors.white,
  },
  bodyOther: {
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  timestampLeft: {
    marginLeft: 4,
  },
  timestampRight: {
    textAlign: 'right',
    marginRight: 4,
  },
  threadBadge: {
    marginTop: 4,
    marginLeft: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  threadBadgeText: {
    fontSize: fontSize.xs,
    color: colors.brand[500],
    fontWeight: fontWeight.medium,
  },
  // Context menu styles
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contextMenu: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 8,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emojiButton: {
    padding: 6,
    borderRadius: 8,
  },
  emojiText: {
    fontSize: 24,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: 12,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
})
