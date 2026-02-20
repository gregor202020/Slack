/**
 * ReactionPills — displays grouped emoji reactions below a message.
 * Tapping a pill toggles the current user's reaction.
 */

import React, { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors } from '../theme/colors'
import { fontSize, fontWeight } from '../theme/typography'
import type { Reaction } from '../stores/chat'

interface GroupedReaction {
  emoji: string
  count: number
  userIds: string[]
  hasCurrentUser: boolean
}

interface ReactionPillsProps {
  reactions: Reaction[]
  currentUserId: string | undefined
  onToggle: (emoji: string) => void
}

export function ReactionPills({ reactions, currentUserId, onToggle }: ReactionPillsProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedReaction>()
    for (const r of reactions) {
      const existing = map.get(r.emoji)
      if (existing) {
        existing.count++
        existing.userIds.push(r.userId)
        if (r.userId === currentUserId) existing.hasCurrentUser = true
      } else {
        map.set(r.emoji, {
          emoji: r.emoji,
          count: 1,
          userIds: [r.userId],
          hasCurrentUser: r.userId === currentUserId,
        })
      }
    }
    return Array.from(map.values())
  }, [reactions, currentUserId])

  if (grouped.length === 0) return null

  return (
    <View style={styles.container}>
      {grouped.map((group) => (
        <Pressable
          key={group.emoji}
          onPress={() => onToggle(group.emoji)}
          style={[
            styles.pill,
            group.hasCurrentUser ? styles.pillActive : styles.pillInactive,
          ]}
        >
          <Text style={styles.emoji}>{group.emoji}</Text>
          <Text
            style={[
              styles.count,
              group.hasCurrentUser ? styles.countActive : styles.countInactive,
            ]}
          >
            {group.count}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    marginLeft: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: `${colors.brand[500]}20`,
    borderColor: `${colors.brand[500]}60`,
  },
  pillInactive: {
    backgroundColor: colors.smoke[50],
    borderColor: colors.smoke[200],
  },
  emoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  count: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  countActive: {
    color: colors.brand[500],
  },
  countInactive: {
    color: colors.textSecondary,
  },
})
