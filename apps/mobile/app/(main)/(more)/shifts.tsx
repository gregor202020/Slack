/**
 * Shifts screen — shows user's upcoming shifts and pending swap requests.
 *
 * Uses GET /api/shifts/my and GET /api/shifts/swaps.
 * Provides "Request Swap" button per shift and accept/decline for incoming swaps.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  useShiftsStore,
  type Shift,
  type ShiftSwap,
} from '../../../src/stores/shifts'
import { useAuthStore } from '../../../src/stores/auth'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

// ---- Helpers ----

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTimeRange(start: string, end: string): string {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const startTime = startDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  const endTime = endDate.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${startTime} - ${endTime}`
}

function getSwapStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return colors.warning
    case 'accepted':
    case 'overridden':
      return colors.success
    case 'declined':
    case 'expired':
      return colors.error
    default:
      return colors.textMuted
  }
}

// ---- Components ----

function ShiftCard({
  shift,
  onRequestSwap,
}: {
  shift: Shift
  onRequestSwap: (shift: Shift) => void
}) {
  const isLocked = !!shift.lockedBySwapId

  return (
    <View style={styles.shiftCard}>
      <View style={styles.shiftHeader}>
        <Text style={styles.shiftDate}>{formatDate(shift.startTime)}</Text>
        {isLocked && (
          <View style={styles.lockedBadge}>
            <Text style={styles.lockedBadgeText}>Swap Pending</Text>
          </View>
        )}
      </View>
      <Text style={styles.shiftTime}>
        {formatTimeRange(shift.startTime, shift.endTime)}
      </Text>
      {shift.venueName && (
        <Text style={styles.shiftVenue}>{shift.venueName}</Text>
      )}
      {shift.roleLabel && (
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{shift.roleLabel}</Text>
        </View>
      )}
      {shift.notes && (
        <Text style={styles.shiftNotes} numberOfLines={2}>
          {shift.notes}
        </Text>
      )}
      <Pressable
        style={[styles.swapButton, isLocked && styles.swapButtonDisabled]}
        onPress={() => onRequestSwap(shift)}
        disabled={isLocked}
      >
        <Text
          style={[
            styles.swapButtonText,
            isLocked && styles.swapButtonTextDisabled,
          ]}
        >
          Request Swap
        </Text>
      </Pressable>
    </View>
  )
}

function SwapRequestCard({
  swap,
  currentUserId,
  onAccept,
  onDecline,
}: {
  swap: ShiftSwap
  currentUserId: string
  onAccept: (swapId: string) => void
  onDecline: (swapId: string) => void
}) {
  const isIncoming = swap.targetUserId === currentUserId
  const isPending = swap.status === 'pending'
  const statusColor = getSwapStatusColor(swap.status)

  return (
    <View style={styles.swapCard}>
      <View style={styles.swapHeader}>
        <Text style={styles.swapDirection}>
          {isIncoming ? 'Incoming Swap Request' : 'Outgoing Swap Request'}
        </Text>
        <View style={[styles.swapStatusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.swapStatusText}>
            {swap.status.charAt(0).toUpperCase() + swap.status.slice(1)}
          </Text>
        </View>
      </View>

      <Text style={styles.swapDetail}>
        From: {swap.requesterName ?? 'Unknown'}
      </Text>
      <Text style={styles.swapDetail}>
        To: {swap.targetName ?? 'Unknown'}
      </Text>

      {swap.shift && (
        <Text style={styles.swapShiftInfo}>
          Shift: {formatDate(swap.shift.startTime)}{' '}
          {formatTimeRange(swap.shift.startTime, swap.shift.endTime)}
        </Text>
      )}

      {swap.targetShift && (
        <Text style={styles.swapShiftInfo}>
          Target Shift: {formatDate(swap.targetShift.startTime)}{' '}
          {formatTimeRange(
            swap.targetShift.startTime,
            swap.targetShift.endTime,
          )}
        </Text>
      )}

      <Text style={styles.swapCreated}>
        Requested: {formatDate(swap.createdAt)}
      </Text>

      {isIncoming && isPending && (
        <View style={styles.swapActions}>
          <Pressable
            style={styles.acceptButton}
            onPress={() => onAccept(swap.id)}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </Pressable>
          <Pressable
            style={styles.declineButton}
            onPress={() => onDecline(swap.id)}
          >
            <Text style={styles.declineButtonText}>Decline</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

// ---- Swap Request Modal ----

function SwapRequestModal({
  visible,
  shift,
  onClose,
  onSubmit,
}: {
  visible: boolean
  shift: Shift | null
  onClose: () => void
  onSubmit: (targetUserId: string, targetShiftId: string) => void
}) {
  const [targetUserId, setTargetUserId] = useState('')
  const [targetShiftId, setTargetShiftId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!targetUserId.trim() || !targetShiftId.trim()) {
      Alert.alert('Error', 'Please enter both the target user ID and shift ID.')
      return
    }
    setIsSubmitting(true)
    try {
      await onSubmit(targetUserId.trim(), targetShiftId.trim())
      setTargetUserId('')
      setTargetShiftId('')
      onClose()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to request swap'
      Alert.alert('Error', message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Request Swap</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          style={styles.modalBody}
          keyboardShouldPersistTaps="handled"
        >
          {shift && (
            <View style={styles.modalShiftInfo}>
              <Text style={styles.modalShiftLabel}>Your Shift</Text>
              <Text style={styles.modalShiftValue}>
                {formatDate(shift.startTime)}
              </Text>
              <Text style={styles.modalShiftValue}>
                {formatTimeRange(shift.startTime, shift.endTime)}
              </Text>
              {shift.venueName && (
                <Text style={styles.modalShiftValue}>{shift.venueName}</Text>
              )}
            </View>
          )}

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Target User ID</Text>
            <TextInput
              style={styles.modalInput}
              value={targetUserId}
              onChangeText={setTargetUserId}
              placeholder="Enter user ID to swap with"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Target Shift ID</Text>
            <TextInput
              style={styles.modalInput}
              value={targetShiftId}
              onChangeText={setTargetShiftId}
              placeholder="Enter their shift ID"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <Pressable
            style={[
              styles.modalSubmitButton,
              isSubmitting && styles.modalSubmitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <Text style={styles.modalSubmitText}>
              {isSubmitting ? 'Submitting...' : 'Submit Swap Request'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

// ---- Main Screen ----

export default function ShiftsScreen() {
  const user = useAuthStore((s) => s.user)
  const {
    shifts,
    swaps,
    isLoadingShifts,
    isLoadingSwaps,
    fetchMyShifts,
    fetchMySwaps,
    requestSwap,
    acceptSwap,
    declineSwap,
  } = useShiftsStore()

  const [refreshing, setRefreshing] = useState(false)
  const [swapModalVisible, setSwapModalVisible] = useState(false)
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null)
  const [activeTab, setActiveTab] = useState<'shifts' | 'swaps'>('shifts')

  useEffect(() => {
    fetchMyShifts()
    fetchMySwaps()
  }, [fetchMyShifts, fetchMySwaps])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([fetchMyShifts(), fetchMySwaps()])
    setRefreshing(false)
  }, [fetchMyShifts, fetchMySwaps])

  const handleRequestSwap = useCallback((shift: Shift) => {
    setSelectedShift(shift)
    setSwapModalVisible(true)
  }, [])

  const handleSubmitSwap = useCallback(
    async (targetUserId: string, targetShiftId: string) => {
      if (!selectedShift) return
      await requestSwap(selectedShift.id, targetUserId, targetShiftId)
    },
    [selectedShift, requestSwap],
  )

  const handleAcceptSwap = useCallback(
    async (swapId: string) => {
      try {
        await acceptSwap(swapId)
        Alert.alert('Success', 'Swap request accepted.')
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to accept swap'
        Alert.alert('Error', message)
      }
    },
    [acceptSwap],
  )

  const handleDeclineSwap = useCallback(
    async (swapId: string) => {
      Alert.alert('Decline Swap', 'Are you sure you want to decline?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            try {
              await declineSwap(swapId)
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : 'Failed to decline swap'
              Alert.alert('Error', message)
            }
          },
        },
      ])
    },
    [declineSwap],
  )

  const isLoading = isLoadingShifts || isLoadingSwaps
  const pendingSwaps = swaps.filter((s) => s.status === 'pending')

  const renderShiftItem = useCallback(
    ({ item }: { item: Shift }) => (
      <ShiftCard shift={item} onRequestSwap={handleRequestSwap} />
    ),
    [handleRequestSwap],
  )

  const renderSwapItem = useCallback(
    ({ item }: { item: ShiftSwap }) => (
      <SwapRequestCard
        swap={item}
        currentUserId={user?.id ?? ''}
        onAccept={handleAcceptSwap}
        onDecline={handleDeclineSwap}
      />
    ),
    [user?.id, handleAcceptSwap, handleDeclineSwap],
  )

  if (isLoading && shifts.length === 0 && swaps.length === 0) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.brand[500]} />
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Tab selector */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'shifts' && styles.tabActive]}
          onPress={() => setActiveTab('shifts')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'shifts' && styles.tabTextActive,
            ]}
          >
            My Shifts
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'swaps' && styles.tabActive]}
          onPress={() => setActiveTab('swaps')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'swaps' && styles.tabTextActive,
            ]}
          >
            Swap Requests
            {pendingSwaps.length > 0 ? ` (${pendingSwaps.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {activeTab === 'shifts' ? (
        <FlatList
          data={shifts}
          keyExtractor={(item) => item.id}
          renderItem={renderShiftItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No upcoming shifts</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand[500]}
            />
          }
        />
      ) : (
        <FlatList
          data={swaps}
          keyExtractor={(item) => item.id}
          renderItem={renderSwapItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No swap requests</Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand[500]}
            />
          }
        />
      )}

      <SwapRequestModal
        visible={swapModalVisible}
        shift={selectedShift}
        onClose={() => {
          setSwapModalVisible(false)
          setSelectedShift(null)
        }}
        onSubmit={handleSubmitSwap}
      />
    </SafeAreaView>
  )
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.brand[500],
  },
  tabText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.brand[500],
    fontWeight: fontWeight.semibold,
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },

  // Shift card
  shiftCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  shiftDate: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  shiftTime: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  shiftVenue: {
    fontSize: fontSize.sm,
    color: colors.brand[500],
    fontWeight: fontWeight.medium,
    marginBottom: 4,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent[50],
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 6,
  },
  roleBadgeText: {
    fontSize: fontSize.xs,
    color: colors.accent[700],
    fontWeight: fontWeight.medium,
  },
  shiftNotes: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: 8,
  },
  lockedBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lockedBadgeText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: fontWeight.medium,
  },
  swapButton: {
    marginTop: 8,
    height: 40,
    backgroundColor: colors.brand[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brand[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapButtonDisabled: {
    backgroundColor: colors.smoke[100],
    borderColor: colors.smoke[200],
  },
  swapButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.brand[500],
  },
  swapButtonTextDisabled: {
    color: colors.textMuted,
  },

  // Swap card
  swapCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  swapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  swapDirection: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    flex: 1,
  },
  swapStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  swapStatusText: {
    fontSize: fontSize.xs,
    color: colors.white,
    fontWeight: fontWeight.medium,
  },
  swapDetail: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  swapShiftInfo: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 4,
  },
  swapCreated: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 8,
  },
  swapActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  acceptButton: {
    flex: 1,
    height: 40,
    backgroundColor: colors.success,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  declineButton: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalCancel: {
    fontSize: fontSize.base,
    color: colors.brand[500],
    width: 60,
  },
  modalTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  modalBody: {
    flex: 1,
    padding: 16,
  },
  modalShiftInfo: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  modalShiftLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  modalShiftValue: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  modalField: {
    marginBottom: 20,
  },
  modalFieldLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.smoke[50],
  },
  modalSubmitButton: {
    height: 52,
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalSubmitButtonDisabled: {
    backgroundColor: colors.brand[200],
  },
  modalSubmitText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
})
