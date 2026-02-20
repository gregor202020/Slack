/**
 * Create Channel screen — form for creating a new channel.
 *
 * Uses POST /api/channels with: name, type, scope, venueId (optional).
 * Uses GET /api/venues for venue picker when scope is "venue".
 */

import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiClient } from '../../../src/lib/api'
import { useChatStore } from '../../../src/stores/chat'
import { useVenuesStore, type Venue } from '../../../src/stores/venues'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

// ---- Types ----

type ChannelType = 'public' | 'private'
type ChannelScope = 'org' | 'venue'

// ---- Components ----

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[]
  value: T
  onChange: (val: T) => void
  labels: Record<T, string>
}) {
  return (
    <View style={segStyles.container}>
      {options.map((option) => (
        <Pressable
          key={option}
          style={[
            segStyles.segment,
            value === option && segStyles.segmentActive,
          ]}
          onPress={() => onChange(option)}
        >
          <Text
            style={[
              segStyles.segmentText,
              value === option && segStyles.segmentTextActive,
            ]}
          >
            {labels[option]}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.smoke[100],
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.brand[500],
    fontWeight: fontWeight.semibold,
  },
})

function VenuePicker({
  venues,
  selectedId,
  onSelect,
  isLoading,
}: {
  venues: Venue[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <View style={vpStyles.loading}>
        <ActivityIndicator size="small" color={colors.brand[500]} />
      </View>
    )
  }

  if (venues.length === 0) {
    return (
      <Text style={vpStyles.empty}>No venues available</Text>
    )
  }

  return (
    <View style={vpStyles.container}>
      {venues
        .filter((v) => v.status === 'active')
        .map((venue) => (
          <Pressable
            key={venue.id}
            style={[
              vpStyles.option,
              selectedId === venue.id && vpStyles.optionSelected,
            ]}
            onPress={() => onSelect(venue.id)}
          >
            <View style={vpStyles.radio}>
              {selectedId === venue.id && (
                <View style={vpStyles.radioInner} />
              )}
            </View>
            <View style={vpStyles.venueInfo}>
              <Text style={vpStyles.venueName}>{venue.name}</Text>
              <Text style={vpStyles.venueAddress} numberOfLines={1}>
                {venue.address}
              </Text>
            </View>
          </Pressable>
        ))}
    </View>
  )
}

const vpStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  loading: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginLeft: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.smoke[50],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  optionSelected: {
    backgroundColor: colors.brand[50],
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand[500],
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  venueAddress: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 1,
  },
})

// ---- Main Screen ----

export default function CreateChannelScreen() {
  const router = useRouter()
  const fetchChannels = useChatStore((s) => s.fetchChannels)
  const { venues, fetchVenues, isLoading: isLoadingVenues } = useVenuesStore()

  const [name, setName] = useState('')
  const [type, setType] = useState<ChannelType>('public')
  const [scope, setScope] = useState<ChannelScope>('org')
  const [venueId, setVenueId] = useState<string | undefined>(undefined)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    fetchVenues()
  }, [fetchVenues])

  const canSubmit = name.trim().length > 0 && (scope === 'org' || venueId)

  const handleCreate = async () => {
    if (!canSubmit || isSaving) return
    setIsSaving(true)

    try {
      const body: {
        name: string
        type: ChannelType
        scope: ChannelScope
        venueId?: string
      } = {
        name: name.trim(),
        type,
        scope,
      }

      if (scope === 'venue' && venueId) {
        body.venueId = venueId
      }

      await apiClient.post('/channels', body)
      await fetchChannels()
      Alert.alert('Success', `Channel #${name.trim()} has been created.`)
      router.back()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create channel'
      Alert.alert('Error', message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Channel name */}
          <View style={styles.field}>
            <Text style={styles.label}>Channel Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. kitchen-team"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={80}
            />
            <Text style={styles.hint}>
              Must be lowercase, no spaces. Use hyphens to separate words.
            </Text>
          </View>

          {/* Channel type */}
          <View style={styles.field}>
            <Text style={styles.label}>Type</Text>
            <SegmentControl
              options={['public', 'private'] as ChannelType[]}
              value={type}
              onChange={setType}
              labels={{
                public: 'Public',
                private: 'Private',
              }}
            />
            <Text style={styles.hint}>
              {type === 'public'
                ? 'Anyone in the organization can join.'
                : 'Invite-only. Only members can see messages.'}
            </Text>
          </View>

          {/* Channel scope */}
          <View style={styles.field}>
            <Text style={styles.label}>Scope</Text>
            <SegmentControl
              options={['org', 'venue'] as ChannelScope[]}
              value={scope}
              onChange={(val) => {
                setScope(val)
                if (val === 'org') setVenueId(undefined)
              }}
              labels={{
                org: 'Organization',
                venue: 'Venue',
              }}
            />
            <Text style={styles.hint}>
              {scope === 'org'
                ? 'Visible to the entire organization.'
                : 'Scoped to a specific venue.'}
            </Text>
          </View>

          {/* Venue picker (only if venue scope) */}
          {scope === 'venue' && (
            <View style={styles.field}>
              <Text style={styles.label}>Select Venue</Text>
              <VenuePicker
                venues={venues}
                selectedId={venueId}
                onSelect={setVenueId}
                isLoading={isLoadingVenues}
              />
            </View>
          )}

          {/* Create button */}
          <Pressable
            style={[
              styles.createButton,
              (!canSubmit || isSaving) && styles.createButtonDisabled,
            ]}
            onPress={handleCreate}
            disabled={!canSubmit || isSaving}
          >
            <Text style={styles.createButtonText}>
              {isSaving ? 'Creating...' : 'Create Channel'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.smoke[50],
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 6,
    marginLeft: 4,
  },
  createButton: {
    height: 52,
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    backgroundColor: colors.brand[200],
  },
  createButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
})
