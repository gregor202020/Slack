/**
 * Edit Profile screen — update display name and avatar.
 *
 * Uses PATCH /api/users/me to save changes.
 */

import React, { useState } from 'react'
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
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../../src/stores/auth'
import { apiClient } from '../../../src/lib/api'
import { Avatar } from '../../../src/components/Avatar'
import { colors } from '../../../src/theme/colors'
import { fontSize, fontWeight } from '../../../src/theme/typography'

export default function ProfileScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const fetchMe = useAuthStore((s) => s.fetchMe)

  const [fullName, setFullName] = useState(user?.fullName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges =
    fullName !== (user?.fullName ?? '') ||
    email !== (user?.email ?? '')

  const handleSave = async () => {
    if (!hasChanges || isSaving) return
    setIsSaving(true)

    try {
      await apiClient.patch('/users/me', {
        fullName: fullName.trim() || undefined,
        email: email.trim() || undefined,
      })

      await fetchMe()
      Alert.alert('Success', 'Your profile has been updated.')
      router.back()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update profile'
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
          {/* Avatar section */}
          <View style={styles.avatarSection}>
            <Avatar
              imageUrl={user?.avatarUrl}
              name={fullName || user?.fullName}
              size={80}
            />
            <Pressable style={styles.changePhotoButton}>
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </Pressable>
          </View>

          {/* Form fields */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                maxLength={100}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={254}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.disabledText}>{user?.phone ?? ''}</Text>
              </View>
              <Text style={styles.hint}>
                Phone number cannot be changed
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Role</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.disabledText}>
                  {formatRole(user?.orgRole)}
                </Text>
              </View>
            </View>
          </View>

          {/* Save button */}
          <Pressable
            style={[
              styles.saveButton,
              (!hasChanges || isSaving) && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
          >
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function formatRole(role?: string): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin'
    case 'admin':
      return 'Admin'
    case 'mid':
      return 'Manager'
    case 'basic':
      return 'Team Member'
    default:
      return 'Team Member'
  }
}

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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  changePhotoButton: {
    marginTop: 12,
  },
  changePhotoText: {
    fontSize: fontSize.base,
    color: colors.brand[500],
    fontWeight: fontWeight.medium,
  },
  form: {
    marginBottom: 32,
  },
  field: {
    marginBottom: 20,
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
    justifyContent: 'center',
  },
  inputDisabled: {
    backgroundColor: colors.smoke[100],
  },
  disabledText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 4,
    marginLeft: 4,
  },
  saveButton: {
    height: 52,
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.brand[200],
  },
  saveButtonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
})
