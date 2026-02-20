/**
 * Files store — manages file uploads and attachment display.
 *
 * API endpoints used:
 *   POST /api/files/upload          — upload a file (multipart)
 *   GET  /api/files/:fileId/download — get signed download URL
 *   GET  /api/files/:fileId          — get file metadata
 */

import { create } from 'zustand'
import { apiClient, getAccessToken, API_URL } from '../lib/api'

// ---- Types ----

export interface FileRecord {
  id: string
  userId: string
  channelId: string | null
  dmId: string | null
  messageId: string | null
  originalFilename: string
  sanitizedFilename: string
  mimeType: string
  sizeBytes: number
  s3Key: string
  createdAt: string
}

export interface UploadProgress {
  fileId: string
  progress: number // 0-1
  filename: string
  status: 'uploading' | 'done' | 'error'
}

// ---- Store ----

interface FilesState {
  uploads: Record<string, UploadProgress>

  uploadFile: (
    uri: string,
    filename: string,
    mimeType: string,
    targetId: string,
    targetType: 'channel' | 'dm',
  ) => Promise<FileRecord>

  getDownloadUrl: (fileId: string) => Promise<string>

  clearUpload: (fileId: string) => void
}

export const useFilesStore = create<FilesState>((set) => ({
  uploads: {},

  uploadFile: async (uri, filename, mimeType, targetId, targetType) => {
    const tempId = `upload_${Date.now()}`

    set((state) => ({
      uploads: {
        ...state.uploads,
        [tempId]: {
          fileId: tempId,
          progress: 0,
          filename,
          status: 'uploading',
        },
      },
    }))

    try {
      const formData = new FormData()

      // React Native FormData accepts this shape for file uploads
      formData.append('file', {
        uri,
        name: filename,
        type: mimeType,
      } as unknown as Blob)

      if (targetType === 'channel') {
        formData.append('channelId', targetId)
      } else {
        formData.append('dmId', targetId)
      }

      const accessToken = await getAccessToken()

      const response = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: accessToken ? `Bearer ${accessToken}` : '',
        },
        body: formData,
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(
          (errorBody as { message?: string }).message ??
            `Upload failed: ${response.status}`,
        )
      }

      const file = (await response.json()) as FileRecord

      set((state) => ({
        uploads: {
          ...state.uploads,
          [tempId]: {
            fileId: file.id,
            progress: 1,
            filename,
            status: 'done',
          },
        },
      }))

      return file
    } catch (err) {
      set((state) => ({
        uploads: {
          ...state.uploads,
          [tempId]: {
            fileId: tempId,
            progress: 0,
            filename,
            status: 'error',
          },
        },
      }))
      throw err
    }
  },

  getDownloadUrl: async (fileId: string) => {
    const data = await apiClient.get<{ url: string }>(
      `/files/${fileId}/download`,
    )
    return data.url
  },

  clearUpload: (fileId: string) => {
    set((state) => {
      const uploads = { ...state.uploads }
      delete uploads[fileId]
      return { uploads }
    })
  },
}))
