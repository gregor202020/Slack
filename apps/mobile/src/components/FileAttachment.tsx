/**
 * FileAttachment — displays a file attachment within a message bubble.
 *
 * Shows filename, size, and a download link that opens the signed URL.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, Linking, Alert } from 'react-native'
import { useFilesStore } from '../stores/files'
import { colors } from '../theme/colors'
import { fontSize, fontWeight } from '../theme/typography'

interface FileAttachmentProps {
  fileId: string
  filename: string
  sizeBytes: number
  mimeType: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '\uD83D\uDDBC'
  if (mimeType.startsWith('video/')) return '\uD83C\uDFA5'
  if (mimeType.startsWith('audio/')) return '\uD83C\uDFB5'
  if (mimeType.includes('pdf')) return '\uD83D\uDCC4'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel'))
    return '\uD83D\uDCCA'
  if (mimeType.includes('document') || mimeType.includes('word'))
    return '\uD83D\uDCC3'
  return '\uD83D\uDCC1'
}

export function FileAttachment({
  fileId,
  filename,
  sizeBytes,
  mimeType,
}: FileAttachmentProps) {
  const getDownloadUrl = useFilesStore((s) => s.getDownloadUrl)
  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const url = await getDownloadUrl(fileId)
      const supported = await Linking.canOpenURL(url)
      if (supported) {
        await Linking.openURL(url)
      } else {
        Alert.alert('Error', 'Cannot open this file type.')
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to get download URL'
      Alert.alert('Error', message)
    } finally {
      setIsDownloading(false)
    }
  }

  const icon = getFileIcon(mimeType)

  return (
    <Pressable
      style={styles.container}
      onPress={handleDownload}
      disabled={isDownloading}
    >
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.info}>
        <Text style={styles.filename} numberOfLines={1}>
          {filename}
        </Text>
        <Text style={styles.meta}>
          {formatFileSize(sizeBytes)}
          {isDownloading ? ' - Opening...' : ' - Tap to download'}
        </Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.smoke[50],
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginTop: 6,
    gap: 10,
  },
  icon: {
    fontSize: 24,
  },
  info: {
    flex: 1,
  },
  filename: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.brand[600],
  },
  meta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 1,
  },
})
