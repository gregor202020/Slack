/**
 * Login screen — phone number entry with country code.
 *
 * Sends an OTP via POST /api/auth, then navigates to the verify screen.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../src/stores/auth'
import { colors } from '../../src/theme/colors'
import { fontSize, fontWeight } from '../../src/theme/typography'

export default function LoginScreen() {
  const router = useRouter()
  const { requestOtp, isLoading, error, clearError } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+1')

  const fullPhone = `${countryCode}${phone.replace(/\D/g, '')}`
  const isValid = phone.replace(/\D/g, '').length >= 10

  const handleSendCode = async () => {
    if (!isValid) return
    clearError()

    try {
      await requestOtp(fullPhone)
      router.push({
        pathname: '/(auth)/verify',
        params: { phone: fullPhone },
      })
    } catch {
      Alert.alert(
        'Error',
        error ?? 'Failed to send verification code. Please try again.',
      )
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>The Smoker</Text>
          <Text style={styles.subtitle}>Sign in to your team</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Phone number</Text>
          <View style={styles.phoneRow}>
            <TextInput
              style={styles.countryInput}
              value={countryCode}
              onChangeText={setCountryCode}
              keyboardType="phone-pad"
              maxLength={4}
              placeholder="+1"
              placeholderTextColor={colors.textMuted}
            />
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="(555) 123-4567"
              placeholderTextColor={colors.textMuted}
              autoFocus
              maxLength={14}
            />
          </View>

          {error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={[
              styles.button,
              (!isValid || isLoading) && styles.buttonDisabled,
            ]}
            onPress={handleSendCode}
            disabled={!isValid || isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? 'Sending...' : 'Send Code'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            We'll send a verification code to this number
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.brand[500],
    marginBottom: 8,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  form: {
    marginBottom: 32,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  countryInput: {
    width: 64,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.smoke[50],
    textAlign: 'center',
  },
  phoneInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    backgroundColor: colors.smoke[50],
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginBottom: 12,
    marginLeft: 4,
  },
  button: {
    height: 52,
    backgroundColor: colors.brand[500],
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.brand[200],
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
})
