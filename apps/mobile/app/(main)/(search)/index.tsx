/**
 * Search screen -- Full-text search across messages, channels, and people.
 *
 * Features:
 * - Debounced text input (300ms)
 * - Categorized results (Messages, Channels, People)
 * - Tab filtering
 * - Navigation: message -> channel/DM, channel -> channel, user -> DM
 */

import React, { useState, useCallback, useRef, useMemo } from 'react'
import {
  View,
  TextInput,
  FlatList,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  SectionList,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient } from '../../../src/lib/api'
import { useChatStore } from '../../../src/stores/chat'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchMessage {
  id: string
  body: string
  headline: string
  userId: string
  authorName: string
  channelId: string | null
  channelName: string | null
  dmId: string | null
  createdAt: string
}

interface SearchChannel {
  id: string
  name: string
  topic: string | null
  type: string
}

interface SearchUser {
  id: string
  fullName: string
  orgRole: string
}

interface SearchAllResult {
  messages: SearchMessage[]
  channels: SearchChannel[]
  users: SearchUser[]
}

type TabKey = 'all' | 'messages' | 'channels' | 'users'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'messages', label: 'Messages' },
  { key: 'channels', label: 'Channels' },
  { key: 'users', label: 'People' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags from the headline for display in React Native */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

/** Format a date string to a short readable date */
function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const router = useRouter()
  const setActiveChannel = useChatStore((s) => s.setActiveChannel)
  const setActiveDm = useChatStore((s) => s.setActiveDm)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchAllResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('all')

  // Debounced search
  const performSearch = useCallback(async (q: string, tab: TabKey) => {
    if (q.length < 2) {
      setResults(null)
      return
    }

    setIsLoading(true)
    try {
      const data = await apiClient.get<SearchAllResult>('/search', {
        params: { q, type: tab },
      })
      setResults(data)
    } catch {
      setResults(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value)

      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }

      debounceRef.current = setTimeout(() => {
        performSearch(value, activeTab)
      }, 300)
    },
    [activeTab, performSearch],
  )

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab)
      if (query.length >= 2) {
        performSearch(query, tab)
      }
    },
    [query, performSearch],
  )

  // Navigation handlers
  const handleMessagePress = useCallback(
    (msg: SearchMessage) => {
      if (msg.channelId) {
        setActiveChannel(msg.channelId)
        router.push({
          pathname: '/(main)/(channels)/[channelId]',
          params: { channelId: msg.channelId },
        })
      } else if (msg.dmId) {
        setActiveDm(msg.dmId)
        router.push({
          pathname: '/(main)/(dms)/[dmId]',
          params: { dmId: msg.dmId },
        })
      }
    },
    [router, setActiveChannel, setActiveDm],
  )

  const handleChannelPress = useCallback(
    (ch: SearchChannel) => {
      setActiveChannel(ch.id)
      router.push({
        pathname: '/(main)/(channels)/[channelId]',
        params: { channelId: ch.id },
      })
    },
    [router, setActiveChannel],
  )

  const handleUserPress = useCallback(
    (user: SearchUser) => {
      // Navigate to DMs for this user
      router.push({
        pathname: '/(main)/(dms)/index',
      })
    },
    [router],
  )

  // Build sections for SectionList
  const sections = useMemo(() => {
    if (!results) return []

    const s: { title: string; data: unknown[] }[] = []

    const showChannels = activeTab === 'all' || activeTab === 'channels'
    const showUsers = activeTab === 'all' || activeTab === 'users'
    const showMessages = activeTab === 'all' || activeTab === 'messages'

    if (showChannels && results.channels.length > 0) {
      s.push({ title: 'Channels', data: results.channels })
    }
    if (showUsers && results.users.length > 0) {
      s.push({ title: 'People', data: results.users })
    }
    if (showMessages && results.messages.length > 0) {
      s.push({ title: 'Messages', data: results.messages })
    }

    return s
  }, [results, activeTab])

  // Render section items
  const renderItem = useCallback(
    ({ item, section }: { item: unknown; section: { title: string } }) => {
      if (section.title === 'Channels') {
        const ch = item as SearchChannel
        return (
          <Pressable style={styles.resultRow} onPress={() => handleChannelPress(ch)}>
            <Text style={styles.channelHash}>#</Text>
            <View style={styles.resultContent}>
              <Text style={styles.resultTitle}>{ch.name}</Text>
              {ch.topic ? (
                <Text style={styles.resultSubtext} numberOfLines={1}>
                  {ch.topic}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )
      }

      if (section.title === 'People') {
        const user = item as SearchUser
        return (
          <Pressable style={styles.resultRow} onPress={() => handleUserPress(user)}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {user.fullName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.resultContent}>
              <Text style={styles.resultTitle}>{user.fullName}</Text>
              {user.orgRole !== 'basic' ? (
                <Text style={styles.resultSubtext}>{user.orgRole}</Text>
              ) : null}
            </View>
          </Pressable>
        )
      }

      if (section.title === 'Messages') {
        const msg = item as SearchMessage
        return (
          <Pressable style={styles.resultRow} onPress={() => handleMessagePress(msg)}>
            <View style={styles.resultContent}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageSender}>{msg.authorName}</Text>
                {msg.channelName ? (
                  <Text style={styles.resultSubtext}>
                    {' '}in #{msg.channelName}
                  </Text>
                ) : msg.dmId ? (
                  <Text style={styles.resultSubtext}> in DM</Text>
                ) : null}
                <Text style={styles.messageDate}>{shortDate(msg.createdAt)}</Text>
              </View>
              <Text style={styles.messageBody} numberOfLines={2}>
                {stripHtml(msg.headline)}
              </Text>
            </View>
          </Pressable>
        )
      }

      return null
    },
    [handleChannelPress, handleUserPress, handleMessagePress],
  )

  const renderSectionHeader = useCallback(
    ({ section }: { section: { title: string } }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{section.title}</Text>
      </View>
    ),
    [],
  )

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Search input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={handleInputChange}
          placeholder="Search messages, channels, people..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      </View>

      {/* Tabs */}
      {query.length >= 2 && (
        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && styles.tabActive,
              ]}
              onPress={() => handleTabChange(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab.key && styles.tabTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Results */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      ) : query.length < 2 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Type at least 2 characters to search</Text>
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item: unknown, index: number) => {
            const typed = item as { id?: string }
            return typed.id ?? String(index)
          }}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  searchInput: {
    height: 40,
    backgroundColor: colors.smoke[50],
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.smoke[50],
  },
  tabActive: {
    backgroundColor: colors.brand[500],
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    backgroundColor: colors.surface,
  },
  sectionHeaderText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  resultSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 1,
  },
  channelHash: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    width: 24,
    textAlign: 'center',
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.smoke[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 2,
  },
  messageSender: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  messageDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginLeft: 'auto',
  },
  messageBody: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
})
