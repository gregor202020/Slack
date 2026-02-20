/**
 * Thread screen — shows parent message, replies, and a composer to send replies.
 *
 * Pushed from the channel messages screen when the user taps
 * "Reply in Thread" or the thread reply count badge.
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
import { useLocalSearchParams, useNavigation } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChatStore, type Message } from '../../../../src/stores/chat'
import { useAuthStore } from '../../../../src/stores/auth'
import { MessageBubble } from '../../../../src/components/MessageBubble'
import { colors } from '../../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../../src/theme/typography'

export default function ThreadScreen() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>()
  const navigation = useNavigation()
  const user = useAuthStore((s) => s.user)
  const {
    threadMessages,
    isLoadingThread,
    openThread,
    closeThread,
    sendThreadReply,
  } = useChatStore()

  // Find parent message from any loaded messages across all channels/DMs
  const allMessages = useChatStore((s) => s.messages)
  const parentMessage = Object.values(allMessages)
    .flat()
    .find((m) => m.id === messageId) ?? null

  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)

  useEffect(() => {
    navigation.setOptions({ title: 'Thread' })
  }, [navigation])

  useEffect(() => {
    if (messageId) {
      openThread(messageId)
    }
    return () => {
      closeThread()
    }
  }, [messageId, openThread, closeThread])

  const handleSend = useCallback(async () => {
    if (!text.trim() || !messageId || isSending) return
    const messageText = text.trim()
    setText('')
    setIsSending(true)

    try {
      await sendThreadReply(messageId, messageText)
    } catch {
      setText(messageText)
    } finally {
      setIsSending(false)
    }
  }, [text, messageId, isSending, sendThreadReply])

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
        isThreadView
      />
    ),
    [user?.id],
  )

  // Build the data: parent message first, then replies
  const listData = parentMessage
    ? [parentMessage, ...threadMessages]
    : threadMessages

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoadingThread && threadMessages.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand[500]} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.messageList}
            ListHeaderComponent={
              parentMessage ? (
                <View style={styles.parentHeader}>
                  <View style={styles.parentDivider}>
                    <View style={styles.parentDividerLine} />
                    <Text style={styles.parentDividerText}>
                      {threadMessages.length}{' '}
                      {threadMessages.length === 1 ? 'reply' : 'replies'}
                    </Text>
                    <View style={styles.parentDividerLine} />
                  </View>
                </View>
              ) : null
            }
            stickyHeaderIndices={parentMessage ? [1] : undefined}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            value={text}
            onChangeText={setText}
            placeholder="Reply..."
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
            <Text style={styles.sendText}>Reply</Text>
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
  parentHeader: {
    paddingTop: 4,
  },
  parentDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  parentDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  parentDividerText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    paddingHorizontal: 8,
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
