/**
 * Channel messages screen — FlatList of messages with a composer input.
 *
 * Loads messages for the channel, listens for real-time updates,
 * and supports sending new messages.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react'
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChatStore, type Message } from '../../../src/stores/chat'
import { useAuthStore } from '../../../src/stores/auth'
import { MessageBubble } from '../../../src/components/MessageBubble'
import { AttachButton } from '../../../src/components/AttachButton'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

export default function ChannelMessagesScreen() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>()
  const navigation = useNavigation()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const {
    messages,
    channels,
    fetchMessages,
    fetchMoreMessages,
    sendMessage,
    setActiveChannel,
    emitTyping,
    isLoadingMessages,
    hasMoreMessages,
  } = useChatStore()

  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const channelMessages = channelId ? messages[channelId] ?? [] : []
  const channel = channels.find((ch) => ch.id === channelId)

  // Set the header title to channel name
  useEffect(() => {
    if (channel) {
      navigation.setOptions({ title: `# ${channel.name}` })
    }
  }, [channel, navigation])

  // Fetch messages and set active channel on mount
  useEffect(() => {
    if (channelId) {
      setActiveChannel(channelId)
      fetchMessages(channelId, 'channel')
    }
    return () => {
      setActiveChannel(null)
    }
  }, [channelId, fetchMessages, setActiveChannel])

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const handleSend = useCallback(async () => {
    if (!text.trim() || !channelId || isSending) return
    const messageText = text.trim()
    setText('')
    setIsSending(true)

    try {
      await sendMessage(channelId, 'channel', messageText)
    } catch {
      // Restore the text if send failed
      setText(messageText)
    } finally {
      setIsSending(false)
    }
  }, [text, channelId, isSending, sendMessage])

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value)

      if (!channelId) return

      // Emit typing start
      emitTyping(channelId, 'channel', true)

      // Clear previous timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      // Emit typing stop after 2 seconds of no input
      typingTimeoutRef.current = setTimeout(() => {
        emitTyping(channelId, 'channel', false)
      }, 2000)
    },
    [channelId, emitTyping],
  )

  const handleEndReached = useCallback(() => {
    if (channelId && hasMoreMessages[channelId]) {
      fetchMoreMessages(channelId, 'channel')
    }
  }, [channelId, hasMoreMessages, fetchMoreMessages])

  const handleReplyInThread = useCallback(
    (messageId: string) => {
      router.push(`/(main)/(channels)/thread/${messageId}` as never)
    },
    [router],
  )

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        messageId={item.id}
        body={item.body}
        senderId={item.senderId}
        senderName={item.senderName}
        senderAvatarUrl={item.senderAvatarUrl}
        createdAt={item.createdAt}
        isOwnMessage={item.senderId === user?.id}
        threadReplyCount={item.threadReplyCount}
        onReplyInThread={handleReplyInThread}
      />
    ),
    [user?.id, handleReplyInThread],
  )

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoadingMessages && channelMessages.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand[500]} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={channelMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.messageList}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
          />
        )}

        <View style={styles.composer}>
          {channelId && (
            <AttachButton targetId={channelId} targetType="channel" />
          )}
          <TextInput
            style={styles.composerInput}
            value={text}
            onChangeText={handleTextChange}
            placeholder="Message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={40000}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!text.trim() || isSending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!text.trim() || isSending}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingVertical: 8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    gap: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.smoke[50],
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  sendButton: {
    height: 40,
    paddingHorizontal: 16,
    backgroundColor: colors.brand[500],
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.brand[200],
  },
  sendText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
})
