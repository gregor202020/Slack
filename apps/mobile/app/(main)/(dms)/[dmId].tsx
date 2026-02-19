/**
 * DM messages screen — message list with composer input.
 *
 * Similar to the channel messages screen but for direct messages.
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
import { useChatStore, type Message } from '../../../src/stores/chat'
import { useAuthStore } from '../../../src/stores/auth'
import { MessageBubble } from '../../../src/components/MessageBubble'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

export default function DmMessagesScreen() {
  const { dmId } = useLocalSearchParams<{ dmId: string }>()
  const navigation = useNavigation()
  const user = useAuthStore((s) => s.user)
  const {
    messages,
    dms,
    fetchMessages,
    fetchMoreMessages,
    sendMessage,
    setActiveDm,
    emitTyping,
    isLoadingMessages,
    hasMoreMessages,
  } = useChatStore()

  const [text, setText] = useState('')
  const [isSending, setIsSending] = useState(false)
  const flatListRef = useRef<FlatList>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dmMessages = dmId ? messages[dmId] ?? [] : []
  const dm = dms.find((d) => d.id === dmId)

  // Set header title to the other member's name
  useEffect(() => {
    if (dm) {
      const other = dm.members.find((m) => m.userId !== user?.id)
      const title =
        dm.type === 'group'
          ? dm.members
              .filter((m) => m.userId !== user?.id)
              .map((m) => m.displayName ?? m.fullName ?? 'Unknown')
              .join(', ')
          : other?.displayName ?? other?.fullName ?? 'Direct Message'

      navigation.setOptions({ title })
    }
  }, [dm, user?.id, navigation])

  // Fetch messages and set active DM on mount
  useEffect(() => {
    if (dmId) {
      setActiveDm(dmId)
      fetchMessages(dmId, 'dm')
    }
    return () => {
      setActiveDm(null)
    }
  }, [dmId, fetchMessages, setActiveDm])

  const handleSend = useCallback(async () => {
    if (!text.trim() || !dmId || isSending) return
    const messageText = text.trim()
    setText('')
    setIsSending(true)

    try {
      await sendMessage(dmId, 'dm', messageText)
    } catch {
      setText(messageText)
    } finally {
      setIsSending(false)
    }
  }, [text, dmId, isSending, sendMessage])

  const handleTextChange = useCallback(
    (value: string) => {
      setText(value)

      if (!dmId) return

      emitTyping(dmId, 'dm', true)

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      typingTimeoutRef.current = setTimeout(() => {
        emitTyping(dmId, 'dm', false)
      }, 2000)
    },
    [dmId, emitTyping],
  )

  const handleEndReached = useCallback(() => {
    if (dmId && hasMoreMessages[dmId]) {
      fetchMoreMessages(dmId, 'dm')
    }
  }, [dmId, hasMoreMessages, fetchMoreMessages])

  const renderItem = useCallback(
    ({ item }: { item: Message }) => (
      <MessageBubble
        body={item.body}
        senderName={item.senderName}
        senderAvatarUrl={item.senderAvatarUrl}
        createdAt={item.createdAt}
        isOwnMessage={item.senderId === user?.id}
      />
    ),
    [user?.id],
  )

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {isLoadingMessages && dmMessages.length === 0 ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.brand[500]} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={dmMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.messageList}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.3}
          />
        )}

        <View style={styles.composer}>
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
