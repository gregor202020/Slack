/**
 * MessageBubble — chat message with sender info, timestamp, and content.
 *
 * Own messages: right-aligned, brand blue background, white text.
 * Others' messages: left-aligned, light gray background, dark text.
 */

import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Avatar } from './Avatar'
import { colors } from '../theme/colors'
import { fontSize, fontWeight } from '../theme/typography'

interface MessageBubbleProps {
  body: string
  senderName: string | null
  senderAvatarUrl: string | null
  createdAt: string
  isOwnMessage: boolean
  showSender?: boolean
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function MessageBubble({
  body,
  senderName,
  senderAvatarUrl,
  createdAt,
  isOwnMessage,
  showSender = true,
}: MessageBubbleProps) {
  return (
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
})
