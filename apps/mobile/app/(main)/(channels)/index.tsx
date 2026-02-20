/**
 * Channel list screen — FlatList of channels with search filtering.
 *
 * Fetches channels on mount and renders each with ChannelListItem.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  FlatList,
  TextInput,
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { useRouter, useNavigation } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useChatStore, type Channel } from '../../../src/stores/chat'
import { ChannelListItem } from '../../../src/components/ChannelListItem'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

export default function ChannelListScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { channels, fetchChannels, isLoadingChannels, setActiveChannel, unreadCounts, fetchUnreadCounts } = useChatStore()
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  // Add "+" button to the header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => router.push('/(main)/(channels)/create')}
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>+</Text>
        </Pressable>
      ),
    })
  }, [navigation, router])

  useEffect(() => {
    fetchChannels()
    fetchUnreadCounts()
  }, [fetchChannels, fetchUnreadCounts])

  const filteredChannels = search.trim()
    ? channels.filter((ch) =>
        ch.name.toLowerCase().includes(search.toLowerCase()),
      )
    : channels

  const handlePress = useCallback(
    (channel: Channel) => {
      setActiveChannel(channel.id)
      router.push({
        pathname: '/(main)/(channels)/[channelId]',
        params: { channelId: channel.id },
      })
    },
    [router, setActiveChannel],
  )

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchChannels(), fetchUnreadCounts()])
    setRefreshing(false)
  }, [fetchChannels, fetchUnreadCounts])

  const renderItem = useCallback(
    ({ item }: { item: Channel }) => (
      <ChannelListItem
        name={item.name}
        lastMessage={item.lastMessagePreview}
        lastMessageAt={item.lastMessageAt}
        unreadCount={unreadCounts[item.id] ?? item.unreadCount}
        isPrivate={item.type === 'private'}
        onPress={() => handlePress(item)}
      />
    ),
    [handlePress, unreadCounts],
  )

  if (isLoadingChannels && channels.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search channels..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={filteredChannels}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.brand[500]}
          />
        }
      />
    </SafeAreaView>
  )
}

function Separator() {
  return <View style={styles.separator} />
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
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
  list: {
    flexGrow: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.divider,
    marginLeft: 64,
  },
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  headerButtonText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginTop: -1,
  },
})
