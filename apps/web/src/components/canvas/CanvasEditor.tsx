'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { useAuthStore } from '@/stores/auth'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CanvasData {
  id: string
  channelId: string
  yjsState: string | null
  sizeBytes: number
  locked: boolean
  lockedBy: string | null
  createdAt: string
  updatedAt: string
  versionsCount: number
}

interface CanvasVersion {
  id: string
  canvasId: string
  createdAt: string
}

interface VersionsResponse {
  data: CanvasVersion[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode a base64 Yjs state to plain text by reading the Y.Text named "content".
 * Falls back to empty string if decoding fails.
 *
 * NOTE: This is a simplified approach using the Yjs text CRDT as a single
 * shared text field. A real implementation would use a rich-text editor
 * (Tiptap, ProseMirror, BlockNote) with full Yjs binding.
 */
async function decodeYjsToText(base64State: string): Promise<string> {
  try {
    const yjs = await import('yjs')
    const doc = new yjs.Doc()
    const buffer = Uint8Array.from(atob(base64State), (c) => c.charCodeAt(0))
    yjs.applyUpdate(doc, buffer)
    const text = doc.getText('content').toString()
    doc.destroy()
    return text
  } catch {
    return ''
  }
}

/**
 * Encode plain text into a Yjs update (base64).
 * Creates a Y.Doc, sets Y.Text "content" to the new value,
 * and returns the full state as base64.
 */
async function encodeTextToYjsUpdate(
  existingBase64: string | null,
  newText: string,
): Promise<string> {
  const yjs = await import('yjs')

  // Create a doc from existing state
  const oldDoc = new yjs.Doc()
  if (existingBase64) {
    const buffer = Uint8Array.from(atob(existingBase64), (c) => c.charCodeAt(0))
    yjs.applyUpdate(oldDoc, buffer)
  }

  // Create a new doc, apply old state, then set text
  const newDoc = new yjs.Doc()
  if (existingBase64) {
    const buffer = Uint8Array.from(atob(existingBase64), (c) => c.charCodeAt(0))
    yjs.applyUpdate(newDoc, buffer)
  }

  const yText = newDoc.getText('content')
  // Replace entire text content
  newDoc.transact(() => {
    yText.delete(0, yText.length)
    yText.insert(0, newText)
  })

  // Compute the update (diff between old and new)
  const oldState = yjs.encodeStateVector(oldDoc)
  const update = yjs.encodeStateAsUpdate(newDoc, oldState)

  oldDoc.destroy()
  newDoc.destroy()

  // Convert to base64
  return btoa(String.fromCharCode(...update))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CanvasEditor() {
  const params = useParams<{ channelId: string }>()
  const channelId = params.channelId
  const user = useAuthStore((s) => s.user)

  const [canvasData, setCanvasData] = useState<CanvasData | null>(null)
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<CanvasVersion[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [versionsPage, setVersionsPage] = useState(1)
  const [versionsPagination, setVersionsPagination] = useState<{
    total: number
    totalPages: number
  } | null>(null)

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestYjsStateRef = useRef<string | null>(null)
  const pendingTextRef = useRef<string | null>(null)
  const saveCanvasRef = useRef<((newText: string) => Promise<void>) | null>(null)

  // -----------------------------------------------------------------------
  // Fetch canvas
  // -----------------------------------------------------------------------

  const fetchCanvas = useCallback(async () => {
    if (!channelId) return
    setIsLoading(true)
    setError(null)

    try {
      const res = await api<{ data: CanvasData }>(
        `/api/canvas/channel/${channelId}`,
      )
      setCanvasData(res.data)
      latestYjsStateRef.current = res.data.yjsState

      if (res.data.yjsState) {
        const decoded = await decodeYjsToText(res.data.yjsState)
        setText(decoded)
      } else {
        setText('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load canvas')
    } finally {
      setIsLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    fetchCanvas()
  }, [fetchCanvas])

  // -----------------------------------------------------------------------
  // Socket listeners for real-time updates
  // -----------------------------------------------------------------------

  useEffect(() => {
    const socket = getSocket()

    const handleCanvasUpdated = async (data: {
      channelId: string
      update: string
      userId: string
    }) => {
      if (data.channelId !== channelId) return
      // Skip our own updates
      if (data.userId === user?.id) return

      // Re-fetch the full canvas state to stay in sync
      try {
        const res = await api<{ data: CanvasData }>(
          `/api/canvas/channel/${channelId}`,
        )
        setCanvasData(res.data)
        latestYjsStateRef.current = res.data.yjsState

        if (res.data.yjsState) {
          const decoded = await decodeYjsToText(res.data.yjsState)
          setText(decoded)
        }
      } catch {
        // Silently fail on sync errors
      }
    }

    const handleCanvasLocked = (data: {
      channelId: string
      lockedBy: string
    }) => {
      if (data.channelId !== channelId) return
      setCanvasData((prev) =>
        prev ? { ...prev, locked: true, lockedBy: data.lockedBy } : prev,
      )
    }

    const handleCanvasUnlocked = (data: { channelId: string }) => {
      if (data.channelId !== channelId) return
      setCanvasData((prev) =>
        prev ? { ...prev, locked: false, lockedBy: null } : prev,
      )
    }

    const handleCanvasReverted = (data: { channelId: string }) => {
      if (data.channelId !== channelId) return
      // Re-fetch to get reverted state
      fetchCanvas()
    }

    socket.on('canvas:updated', handleCanvasUpdated)
    socket.on('canvas:locked', handleCanvasLocked)
    socket.on('canvas:unlocked', handleCanvasUnlocked)
    socket.on('canvas:reverted', handleCanvasReverted)

    return () => {
      socket.off('canvas:updated', handleCanvasUpdated)
      socket.off('canvas:locked', handleCanvasLocked)
      socket.off('canvas:unlocked', handleCanvasUnlocked)
      socket.off('canvas:reverted', handleCanvasReverted)
    }
  }, [channelId, user?.id, fetchCanvas])

  // -----------------------------------------------------------------------
  // Auto-save with debounce
  // -----------------------------------------------------------------------

  const saveCanvas = useCallback(
    async (newText: string) => {
      if (!channelId || !canvasData) return

      setIsSaving(true)
      try {
        const updateBase64 = await encodeTextToYjsUpdate(
          latestYjsStateRef.current,
          newText,
        )

        const res = await api<{ data: CanvasData }>(
          `/api/canvas/channel/${channelId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ update: updateBase64 }),
          },
        )

        latestYjsStateRef.current = res.data.yjsState
        setCanvasData((prev) =>
          prev
            ? {
                ...prev,
                sizeBytes: res.data.sizeBytes,
                updatedAt: res.data.updatedAt,
              }
            : prev,
        )
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to save canvas',
        )
      } finally {
        setIsSaving(false)
      }
    },
    [channelId, canvasData],
  )

  // Keep saveCanvasRef in sync so the unmount cleanup can call it
  saveCanvasRef.current = saveCanvas

  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText)
      pendingTextRef.current = newText

      // Debounce: save after 500ms of inactivity
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      saveTimeoutRef.current = setTimeout(() => {
        pendingTextRef.current = null
        saveCanvas(newText)
      }, 500)
    },
    [saveCanvas],
  )

  // Cleanup timeout on unmount — flush any pending save
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      // Flush pending unsaved text
      if (pendingTextRef.current !== null && saveCanvasRef.current) {
        saveCanvasRef.current(pendingTextRef.current)
        pendingTextRef.current = null
      }
    }
  }, [])

  // -----------------------------------------------------------------------
  // Lock / Unlock
  // -----------------------------------------------------------------------

  const handleLock = useCallback(async () => {
    if (!channelId) return
    try {
      await api(`/api/canvas/channel/${channelId}/lock`, { method: 'POST' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lock canvas')
    }
  }, [channelId])

  const handleUnlock = useCallback(async () => {
    if (!channelId) return
    try {
      await api(`/api/canvas/channel/${channelId}/unlock`, { method: 'POST' })
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to unlock canvas',
      )
    }
  }, [channelId])

  // -----------------------------------------------------------------------
  // Version history
  // -----------------------------------------------------------------------

  const fetchVersions = useCallback(
    async (page: number = 1) => {
      if (!canvasData) return
      try {
        const res = await api<VersionsResponse>(
          `/api/canvas/channel/${channelId}/versions?page=${page}&limit=10`,
        )
        setVersions(res.data)
        setVersionsPagination({
          total: res.pagination.total,
          totalPages: res.pagination.totalPages,
        })
        setVersionsPage(page)
      } catch {
        // Silently fail
      }
    },
    [channelId, canvasData],
  )

  const handleShowVersions = useCallback(() => {
    setShowVersions((prev) => !prev)
    if (!showVersions) {
      fetchVersions(1)
    }
  }, [showVersions, fetchVersions])

  const handleRevert = useCallback(
    async (versionId: string) => {
      if (!channelId) return
      try {
        await api(`/api/canvas/channel/${channelId}/revert/${versionId}`, {
          method: 'POST',
        })
        // Re-fetch canvas after revert
        await fetchCanvas()
        setShowVersions(false)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to revert canvas',
        )
      }
    },
    [channelId, fetchCanvas],
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-smoke-400">
        Loading canvas...
      </div>
    )
  }

  if (error && !canvasData) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        {error}
      </div>
    )
  }

  const isLocked = canvasData?.locked ?? false
  const isLockedByMe = canvasData?.lockedBy === user?.id
  const canEdit = !isLocked || isLockedByMe

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-smoke-700 bg-smoke-800">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-smoke-200">Canvas</h2>

          {isLocked && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-900/50 text-amber-300">
              Locked{isLockedByMe ? ' (by you)' : ''}
            </span>
          )}

          {isSaving && (
            <span className="text-xs text-smoke-500">Saving...</span>
          )}

          {canvasData && (
            <span className="text-xs text-smoke-600">
              {(canvasData.sizeBytes / 1024).toFixed(1)} KB
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Version history toggle */}
          <button
            onClick={handleShowVersions}
            aria-expanded={showVersions}
            aria-label="Toggle version history"
            className="text-xs px-3 py-1 rounded bg-smoke-700 text-smoke-300 hover:bg-smoke-600 transition-colors"
          >
            {showVersions ? 'Hide History' : 'History'}
            {canvasData && canvasData.versionsCount > 0 && (
              <span className="ml-1 text-smoke-500">
                ({canvasData.versionsCount})
              </span>
            )}
          </button>

          {/* Lock / Unlock */}
          {isLocked ? (
            <button
              onClick={handleUnlock}
              className="text-xs px-3 py-1 rounded bg-amber-800 text-amber-200 hover:bg-amber-700 transition-colors"
            >
              Unlock
            </button>
          ) : (
            <button
              onClick={handleLock}
              className="text-xs px-3 py-1 rounded bg-smoke-700 text-smoke-300 hover:bg-smoke-600 transition-colors"
            >
              Lock
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-900/30 text-red-300 text-xs">
          {error}
          <button
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            className="ml-2 underline hover:no-underline"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <textarea
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            disabled={!canEdit}
            aria-label="Canvas editor"
            placeholder={
              isLocked
                ? 'This canvas is locked and read-only.'
                : 'Start typing to collaborate...'
            }
            className={`
              flex-1 w-full p-4 resize-none bg-smoke-900 text-smoke-100
              placeholder-smoke-600 font-mono text-sm leading-relaxed
              outline-none border-none
              ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}
            `}
            spellCheck
          />
        </div>

        {/* Version history panel */}
        {showVersions && (
          <div className="w-64 border-l border-smoke-700 bg-smoke-850 overflow-y-auto flex-shrink-0">
            <div className="p-3 border-b border-smoke-700">
              <h3 className="text-xs font-semibold text-smoke-300 uppercase tracking-wider">
                Version History
              </h3>
            </div>

            {versions.length === 0 ? (
              <div className="p-3 text-xs text-smoke-500">
                No versions saved yet.
              </div>
            ) : (
              <div className="divide-y divide-smoke-700">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className="p-3 hover:bg-smoke-800 transition-colors"
                  >
                    <div className="text-xs text-smoke-400">
                      {new Date(version.createdAt).toLocaleString()}
                    </div>
                    <button
                      onClick={() => handleRevert(version.id)}
                      className="mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Revert to this version
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {versionsPagination && versionsPagination.totalPages > 1 && (
              <div className="p-3 border-t border-smoke-700 flex items-center justify-between">
                <button
                  onClick={() => fetchVersions(versionsPage - 1)}
                  disabled={versionsPage <= 1}
                  className="text-xs text-smoke-400 hover:text-smoke-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-xs text-smoke-500">
                  {versionsPage} / {versionsPagination.totalPages}
                </span>
                <button
                  onClick={() => fetchVersions(versionsPage + 1)}
                  disabled={versionsPage >= versionsPagination.totalPages}
                  className="text-xs text-smoke-400 hover:text-smoke-200 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
