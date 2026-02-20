'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChatStore } from '@/stores/chat'
import { useToast } from '@/hooks/useToast'
import { getSocket } from '@/lib/socket'
import { api } from '@/lib/api'
import { MAX_MESSAGE_LENGTH, MAX_FILE_SIZE_BYTES, BLOCKED_FILE_EXTENSIONS } from '@smoker/shared'
import { MentionAutocomplete } from './MentionAutocomplete'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return ''
  return filename.slice(dot).toLowerCase()
}

function isFileBlocked(filename: string): boolean {
  const ext = getFileExtension(filename)
  return (BLOCKED_FILE_EXTENSIONS as readonly string[]).includes(ext)
}

export function MessageComposer() {
  const sendMessage = useChatStore((s) => s.sendMessage)
  const activeChannelId = useChatStore((s) => s.activeChannelId)
  const activeDmId = useChatStore((s) => s.activeDmId)
  const [body, setBody] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null)
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()

  // Clean up typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeout.current) {
        clearTimeout(typingTimeout.current)
      }
    }
  }, [])

  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = getSocket()
    const event = isTyping ? 'typing:start' : 'typing:stop'
    if (activeChannelId) {
      socket.emit(event, { channelId: activeChannelId })
    } else if (activeDmId) {
      socket.emit(event, { dmId: activeDmId })
    }
  }, [activeChannelId, activeDmId])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setBody(value)

    // Mention detection: look for @ followed by word characters before the cursor
    const cursorPos = e.target.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/)

    if (mentionMatch) {
      setShowMentions(true)
      setMentionQuery(mentionMatch[1] ?? '')
      setMentionStartIndex(mentionMatch.index ?? null)
    } else {
      setShowMentions(false)
      setMentionQuery('')
      setMentionStartIndex(null)
    }

    // Typing indicator
    emitTyping(true)
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => emitTyping(false), 2000)
  }

  const handleMentionSelect = useCallback((handle: string) => {
    if (mentionStartIndex === null) return

    const before = body.slice(0, mentionStartIndex)
    const cursorPos = textareaRef.current?.selectionStart ?? body.length
    const after = body.slice(cursorPos)

    const newBody = `${before}@${handle} ${after}`
    setBody(newBody)
    setShowMentions(false)
    setMentionQuery('')
    setMentionStartIndex(null)

    // Re-focus the textarea and set cursor after the mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        const newCursorPos = before.length + handle.length + 2 // @handle + space
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
      }
    })
  }, [body, mentionStartIndex])

  const handleMentionClose = useCallback(() => {
    setShowMentions(false)
    setMentionQuery('')
    setMentionStartIndex(null)
  }, [])

  const isOverLimit = body.length > MAX_MESSAGE_LENGTH
  const showCharCount = body.length > MAX_MESSAGE_LENGTH - 500

  const validateFile = useCallback((file: File): boolean => {
    if (isFileBlocked(file.name)) {
      toast.error(`File type "${getFileExtension(file.name)}" is not allowed.`)
      return false
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`File is too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`)
      return false
    }
    return true
  }, [toast])

  const handleFileSelect = useCallback((file: File) => {
    if (validateFile(file)) {
      setSelectedFile(file)
    }
  }, [validateFile])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
    // Reset input so re-selecting the same file works
    e.target.value = ''
  }

  const removeFile = () => {
    setSelectedFile(null)
    setUploadProgress(null)
  }

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set false if leaving the composer area
    if (composerRef.current && !composerRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const uploadFile = async (file: File): Promise<void> => {
    // Step 1: Get presigned upload URL
    const presignRes = await api<{
      data: { uploadUrl: string; fileId: string }
    }>('/api/files/upload', {
      method: 'POST',
      body: JSON.stringify({
        originalFilename: file.name,
        channelId: activeChannelId || undefined,
        dmId: activeDmId || undefined,
      }),
    })

    const { uploadUrl } = presignRes.data

    // Step 2: Upload the file with progress tracking via XHR
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          setUploadProgress(Math.round((e.loaded / e.total) * 100))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error('Upload failed'))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Upload failed')))
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.send(file)
    })
  }

  const handleSubmit = async () => {
    const trimmed = body.trim()
    if ((!trimmed && !selectedFile) || isSending || isOverLimit) return

    setIsSending(true)
    try {
      // Upload file first if attached
      if (selectedFile) {
        setUploadProgress(0)
        await uploadFile(selectedFile)
        toast.success(`File "${selectedFile.name}" uploaded successfully.`)
        setSelectedFile(null)
        setUploadProgress(null)
      }

      // Send text message if there is one
      if (trimmed) {
        await sendMessage(trimmed)
      }

      setBody('')
      emitTyping(false)
    } catch (err) {
      if (selectedFile && uploadProgress !== null) {
        toast.error(`Failed to upload "${selectedFile.name}". Please try again.`)
      } else {
        toast.error('Failed to send message. Please try again.')
      }
      setUploadProgress(null)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Let MentionAutocomplete handle keyboard events when visible
    if (showMentions && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab' || e.key === 'Escape')) {
      // These are handled by the MentionAutocomplete component's document listener
      return
    }
    if (showMentions && e.key === 'Enter') {
      // Let MentionAutocomplete handle Enter for selection
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const isDisabled = !activeChannelId && !activeDmId

  return (
    <div
      ref={composerRef}
      className="border-t border-smoke-600 p-4"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragging && (
        <div className="mb-2 flex items-center justify-center rounded-lg border-2 border-dashed border-brand bg-brand/10 py-6 text-sm text-brand">
          Drop file to attach
        </div>
      )}

      {/* Selected file preview */}
      {selectedFile && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-smoke-700 border border-smoke-600 px-3 py-2 text-sm">
          <svg className="h-4 w-4 shrink-0 text-smoke-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="truncate text-smoke-200">{selectedFile.name}</span>
          <span className="shrink-0 text-xs text-smoke-400">
            {formatFileSize(selectedFile.size)}
          </span>
          {uploadProgress !== null && (
            <div className="flex-1 min-w-[60px] max-w-[120px]">
              <div className="h-1.5 rounded-full bg-smoke-600 overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
          {uploadProgress === null && (
            <button
              onClick={removeFile}
              className="shrink-0 p-0.5 text-smoke-400 hover:text-smoke-200 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="relative">
        {/* Mention autocomplete popup */}
        {showMentions && (
          <MentionAutocomplete
            query={mentionQuery}
            onSelect={handleMentionSelect}
            onClose={handleMentionClose}
          />
        )}

        <div className="flex items-end gap-2 rounded-lg bg-smoke-700 border border-smoke-600 p-2">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled || isSending}
            className="shrink-0 p-1.5 rounded-md text-smoke-400 hover:text-smoke-200 hover:bg-smoke-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Attach file"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isDisabled ? 'Select a conversation' : 'Type a message...'}
            disabled={isDisabled}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={1}
            className="flex-1 bg-transparent text-sm text-smoke-100 placeholder:text-smoke-400 resize-none focus:outline-none min-h-[36px] max-h-32"
          />
          <button
            onClick={handleSubmit}
            disabled={(!body.trim() && !selectedFile) || isSending || isDisabled || isOverLimit}
            className="shrink-0 p-1.5 rounded-md bg-brand text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
      {showCharCount && (
        <p className={`text-xs mt-1 text-right ${isOverLimit ? 'text-error' : 'text-smoke-400'}`}>
          {body.length.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
        </p>
      )}
    </div>
  )
}
