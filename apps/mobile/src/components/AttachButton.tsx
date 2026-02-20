/**
 * AttachButton — opens a picker to select a file or image for upload.
 *
 * Uses expo-image-picker for images and expo-document-picker for documents.
 * Shows upload progress overlay while uploading.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useFilesStore } from '../stores/files'
import { colors } from '../theme/colors'
import { fontSize, fontWeight } from '../theme/typography'

interface AttachButtonProps {
  targetId: string
  targetType: 'channel' | 'dm'
  onFileUploaded?: (fileId: string, filename: string) => void
}

export function AttachButton({
  targetId,
  targetType,
  onFileUploaded,
}: AttachButtonProps) {
  const uploadFile = useFilesStore((s) => s.uploadFile)
  const [isPickerVisible, setIsPickerVisible] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  const handlePickImage = async () => {
    setIsPickerVisible(false)

    const permissionResult =
      await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permissionResult.granted) {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library.',
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: false,
    })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    const filename =
      asset.fileName ?? `image_${Date.now()}.${asset.type === 'video' ? 'mp4' : 'jpg'}`
    const mimeType =
      asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')

    await doUpload(asset.uri, filename, mimeType)
  }

  const handlePickDocument = async () => {
    setIsPickerVisible(false)

    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    const filename = asset.name
    const mimeType = asset.mimeType ?? 'application/octet-stream'

    await doUpload(asset.uri, filename, mimeType)
  }

  const doUpload = async (
    uri: string,
    filename: string,
    mimeType: string,
  ) => {
    setIsUploading(true)
    setUploadProgress(`Uploading ${filename}...`)

    try {
      const file = await uploadFile(uri, filename, mimeType, targetId, targetType)
      onFileUploaded?.(file.id, file.originalFilename)
      setUploadProgress('')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Upload failed'
      Alert.alert('Upload Error', message)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      <Pressable
        style={styles.attachButton}
        onPress={() => setIsPickerVisible(true)}
        disabled={isUploading}
      >
        {isUploading ? (
          <ActivityIndicator size="small" color={colors.brand[500]} />
        ) : (
          <Text style={styles.attachIcon}>{'\uD83D\uDCCE'}</Text>
        )}
      </Pressable>

      {/* Upload progress overlay */}
      {isUploading && uploadProgress ? (
        <View style={styles.progressOverlay}>
          <ActivityIndicator size="small" color={colors.brand[500]} />
          <Text style={styles.progressText} numberOfLines={1}>
            {uploadProgress}
          </Text>
        </View>
      ) : null}

      {/* Picker modal */}
      <Modal
        visible={isPickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPickerVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setIsPickerVisible(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Attach</Text>

            <Pressable
              style={styles.pickerOption}
              onPress={handlePickImage}
            >
              <Text style={styles.pickerOptionIcon}>{'\uD83D\uDDBC'}</Text>
              <Text style={styles.pickerOptionText}>Photo or Video</Text>
            </Pressable>

            <Pressable
              style={styles.pickerOption}
              onPress={handlePickDocument}
            >
              <Text style={styles.pickerOptionIcon}>{'\uD83D\uDCC4'}</Text>
              <Text style={styles.pickerOptionText}>Document</Text>
            </Pressable>

            <Pressable
              style={styles.pickerCancel}
              onPress={() => setIsPickerVisible(false)}
            >
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  attachButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.smoke[100],
  },
  attachIcon: {
    fontSize: 20,
  },
  progressOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand[50],
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.brand[100],
    gap: 8,
  },
  progressText: {
    fontSize: fontSize.sm,
    color: colors.brand[700],
    flex: 1,
  },

  // Picker modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  pickerTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  pickerOptionIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  pickerOptionText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  pickerCancel: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 12,
  },
  pickerCancelText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    fontWeight: fontWeight.medium,
  },
})
