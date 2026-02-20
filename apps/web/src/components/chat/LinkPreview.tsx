'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LinkPreviewData {
  id: string
  messageId: string
  url: string
  title: string | null
  description: string | null
  imageUrl: string | null
  fetchedAt: string
}

interface LinkPreviewProps {
  messageId: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkPreview({ messageId }: LinkPreviewProps) {
  const [previews, setPreviews] = useState<LinkPreviewData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const fetchPreviews = async () => {
      try {
        const data = await api<{ previews: LinkPreviewData[] }>(
          `/api/messages/${messageId}/previews`,
        )
        if (!cancelled) {
          setPreviews(data.previews ?? [])
        }
      } catch {
        // Silently fail — link previews are optional
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchPreviews()

    return () => {
      cancelled = true
    }
  }, [messageId])

  if (isLoading || previews.length === 0) {
    return null
  }

  return (
    <div className="mt-2 space-y-2">
      {previews.map((preview) => (
        <a
          key={preview.id}
          href={preview.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex gap-3 rounded-md border border-smoke-600 bg-smoke-800 p-3 hover:border-smoke-500 transition-colors group max-w-md"
        >
          {preview.imageUrl && (
            <div className="shrink-0">
              <img
                src={preview.imageUrl}
                alt=""
                className="h-16 w-16 rounded object-cover"
                loading="lazy"
                onError={(e) => {
                  // Hide broken images
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {preview.title && (
              <p className="text-sm font-medium text-brand group-hover:text-brand-hover line-clamp-1 transition-colors">
                {preview.title}
              </p>
            )}
            {preview.description && (
              <p className="mt-0.5 text-xs text-smoke-400 line-clamp-2">
                {preview.description}
              </p>
            )}
            <p className="mt-1 text-xs text-smoke-500 truncate">
              {new URL(preview.url).hostname}
            </p>
          </div>
        </a>
      ))}
    </div>
  )
}
