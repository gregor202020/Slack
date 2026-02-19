/**
 * Verify screen — 6-digit OTP code entry.
 *
 * Auto-submits when all 6 digits are entered.
 * Includes a resend timer (60 seconds).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
import { useRouter, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthStore } from '../../src/stores/auth'
import { colors } from '../../src/theme/colors'
import { fontSize, fontWeight } from '../../src/theme/typography'

const CODE_LENGTH = 6
const RESEND_INTERVAL = 60 // seconds

export default function VerifyScreen() {
  const router = useRouter()
  const { phone } = useLocalSearchParams<{ phone: string }>()
  const { verifyOtp, requestOtp, isLoading, error, clearError } = useAuthStore()

  const [code, setCode] = useState('')
  const [resendTimer, setResendTimer] = useState(RESEND_INTERVAL)
  const inputRef = useRef<TextInput>(null)

  // Countdown timer for resend
  useEffect(() => {
    if (resendTimer <= 0) return
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [resendTimer])

  // Auto-submit when code is complete
  const handleCodeChange = useCallback(
    (value: string) => {
      const cleaned = value.replace(/\D/g, '').slice(0, CODE_LENGTH)
      setCode(cleaned)
      clearError()

      if (cleaned.length === CODE_LENGTH && phone) {
        handleVerify(cleaned)
      }
    },
    [phone],
  )

  const handleVerify = async (codeValue: string) => {
    if (!phone) return
    try {
      await verifyOtp(phone, codeValue)
      router.replace('/(main)/(channels)')
    } catch (err) {
      Alert.alert(
        'Verification Failed',
        err instanceof Error ? err.message : 'Invalid code. Please try again.',
      )
      setCode('')
      inputRef.current?.focus()
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0 || !phone) return
    try {
      await requestOtp(phone)
      setResendTimer(RESEND_INTERVAL)
      setCode('')
      Alert.alert('Code Sent', 'A new verification code has been sent.')
    } catch {
      Alert.alert('Error', 'Failed to resend code. Please try again.')
    }
  }

  // Render individual code cells
  const renderCodeCells = () => {
    const cells = []
    for (let i = 0; i < CODE_LENGTH; i++) {
      const digit = code[i] ?? ''
      const isFocused = code.length === i
      cells.push(
        <View
          key={i}
          style={[
            styles.cell,
            isFocused && styles.cellFocused,
            digit ? styles.cellFilled : null,
          ]}
        >
          <Text style={styles.cellText}>{digit}</Text>
        </View>,
      )
    }
    return cells
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Enter verification code</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to {phone}
          </Text>
        </View>

        <Pressable
          style={styles.codeContainer}
          onPress={() => inputRef.current?.focus()}
        >
          {renderCodeCells()}
        </Pressable>

        {/* Hidden text input to capture keyboard input */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value={code}
          onChangeText={handleCodeChange}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus
          textContentType="oneTimeCode"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        {isLoading && (
          <Text style={styles.loadingText}>Verifying...</Text>
        )}

        <View style={styles.resendContainer}>
          {resendTimer > 0 ? (
            <Text style={styles.resendTimer}>
              Resend code in {resendTimer}s
            </Text>
          ) : (
            <Pressable onPress={handleResend}>
              <Text style={styles.resendButton}>Resend Code</Text>
            </Pressable>
          )}
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
  },
  backButton: {
    marginTop: 16,
    marginBottom: 24,
  },
  backText: {
    fontSize: fontSize.base,
    color: colors.brand[500],
    fontWeight: fontWeight.medium,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 24,
  },
  cell: {
    width: 48,
    height: 56,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellFocused: {
    borderColor: colors.brand[500],
  },
  cellFilled: {
    borderColor: colors.brand[300],
    backgroundColor: colors.brand[50],
  },
  cellText: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: 12,
  },
  loadingText: {
    color: colors.brand[500],
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: 12,
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  resendTimer: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  resendButton: {
    fontSize: fontSize.base,
    color: colors.brand[500],
    fontWeight: fontWeight.semibold,
  },
})
