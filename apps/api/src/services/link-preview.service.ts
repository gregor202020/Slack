/**
 * Link preview service.
 *
 * Extracts URLs from message bodies, fetches their metadata
 * (title, description, image), and stores link previews in the database.
 *
 * Runs asynchronously — never blocks message creation.
 */

import { eq } from 'drizzle-orm'
import { db, linkPreviews } from '@smoker/db'
import { logger } from '../lib/logger.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 5_000
const MAX_URLS_PER_MESSAGE = 5
const MAX_DESCRIPTION_LENGTH = 500
const MAX_TITLE_LENGTH = 300

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/**
 * Extract URLs from a message body.
 * Returns deduplicated URLs, capped at MAX_URLS_PER_MESSAGE.
 */
export function extractUrls(body: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>[\]()'"]+(?:\([^\s<>[\]()'"]*\))?[^\s<>[\]()'".,;:!?]/g
  const matches = body.match(urlRegex)
  if (!matches) return []

  // Deduplicate and limit
  const unique = [...new Set(matches)]
  return unique.slice(0, MAX_URLS_PER_MESSAGE)
}

// ---------------------------------------------------------------------------
// Meta tag extraction from HTML
// ---------------------------------------------------------------------------

interface LinkMeta {
  title: string | null
  description: string | null
  imageUrl: string | null
}

function extractMetaTags(html: string, baseUrl: string): LinkMeta {
  const result: LinkMeta = {
    title: null,
    description: null,
    imageUrl: null,
  }

  // Extract <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch?.[1]) {
    result.title = decodeHtmlEntities(titleMatch[1].trim()).slice(0, MAX_TITLE_LENGTH)
  }

  // Extract og:title (higher priority than <title>)
  const ogTitleMatch = html.match(
    /<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']og:title["']\s+(?:[^>]*?\s+)?content=["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta\s+(?:[^>]*?\s+)?content=["']([^"']+)["']\s+(?:[^>]*?\s+)?(?:property|name)=["']og:title["']/i,
  )
  if (ogTitleMatch?.[1]) {
    result.title = decodeHtmlEntities(ogTitleMatch[1].trim()).slice(0, MAX_TITLE_LENGTH)
  }

  // Extract og:description or meta description
  const ogDescMatch = html.match(
    /<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']og:description["']\s+(?:[^>]*?\s+)?content=["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta\s+(?:[^>]*?\s+)?content=["']([^"']+)["']\s+(?:[^>]*?\s+)?(?:property|name)=["']og:description["']/i,
  )
  if (ogDescMatch?.[1]) {
    result.description = decodeHtmlEntities(ogDescMatch[1].trim()).slice(0, MAX_DESCRIPTION_LENGTH)
  }

  if (!result.description) {
    const descMatch = html.match(
      /<meta\s+(?:[^>]*?\s+)?name=["']description["']\s+(?:[^>]*?\s+)?content=["']([^"']+)["']/i,
    ) ?? html.match(
      /<meta\s+(?:[^>]*?\s+)?content=["']([^"']+)["']\s+(?:[^>]*?\s+)?name=["']description["']/i,
    )
    if (descMatch?.[1]) {
      result.description = decodeHtmlEntities(descMatch[1].trim()).slice(0, MAX_DESCRIPTION_LENGTH)
    }
  }

  // Extract og:image
  const ogImageMatch = html.match(
    /<meta\s+(?:[^>]*?\s+)?(?:property|name)=["']og:image["']\s+(?:[^>]*?\s+)?content=["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta\s+(?:[^>]*?\s+)?content=["']([^"']+)["']\s+(?:[^>]*?\s+)?(?:property|name)=["']og:image["']/i,
  )
  if (ogImageMatch?.[1]) {
    let imageUrl = ogImageMatch[1].trim()
    // Resolve relative URLs
    if (imageUrl.startsWith('/')) {
      try {
        const base = new URL(baseUrl)
        imageUrl = `${base.protocol}//${base.host}${imageUrl}`
      } catch {
        // Keep as-is if URL parsing fails
      }
    }
    result.imageUrl = imageUrl
  }

  return result
}

/**
 * Simple HTML entity decoder for common entities.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
}

// ---------------------------------------------------------------------------
// Fetch and store a single link preview
// ---------------------------------------------------------------------------

/**
 * Fetch a URL's HTML, extract meta tags, and store the link preview.
 * Respects a 5-second timeout.
 */
export async function fetchAndStoreLinkPreview(
  messageId: string,
  url: string,
): Promise<void> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TheSmokerBot/1.0 (Link Preview)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      logger.debug({ url, status: response.status }, 'Link preview fetch failed')
      return
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      logger.debug({ url, contentType }, 'Link preview: non-HTML content type')
      return
    }

    // Only read the first 50KB of the response to avoid large downloads
    const reader = response.body?.getReader()
    if (!reader) return

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 50 * 1024

    let totalBytes = 0
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      totalBytes += value.byteLength
    }

    reader.cancel()

    const meta = extractMetaTags(html, url)

    // Only store if we got at least a title
    if (!meta.title && !meta.description) {
      logger.debug({ url }, 'Link preview: no metadata found')
      return
    }

    await db.insert(linkPreviews).values({
      messageId,
      url,
      title: meta.title,
      description: meta.description,
      imageUrl: meta.imageUrl,
    })

    logger.info({ messageId, url, title: meta.title }, 'Link preview stored')
  } catch (err) {
    // AbortError means timeout — expected and not a real error
    if (err instanceof Error && err.name === 'AbortError') {
      logger.debug({ url }, 'Link preview fetch timed out')
      return
    }
    logger.warn({ err, url, messageId }, 'Link preview fetch error')
  }
}

// ---------------------------------------------------------------------------
// Process all URLs in a message (non-blocking entry point)
// ---------------------------------------------------------------------------

/**
 * Extract URLs from a message body and fetch link previews for each.
 * This is designed to be called without `await` so it doesn't block
 * message creation.
 */
export async function processLinkPreviews(
  messageId: string,
  body: string,
): Promise<void> {
  const urls = extractUrls(body)
  if (urls.length === 0) return

  // Fetch previews concurrently (all non-blocking)
  await Promise.allSettled(
    urls.map((url) => fetchAndStoreLinkPreview(messageId, url)),
  )
}

// ---------------------------------------------------------------------------
// Get link previews for a message
// ---------------------------------------------------------------------------

/**
 * Retrieve all stored link previews for a given message.
 */
export async function getLinkPreviews(messageId: string) {
  const rows = await db
    .select({
      id: linkPreviews.id,
      messageId: linkPreviews.messageId,
      url: linkPreviews.url,
      title: linkPreviews.title,
      description: linkPreviews.description,
      imageUrl: linkPreviews.imageUrl,
      fetchedAt: linkPreviews.fetchedAt,
    })
    .from(linkPreviews)
    .where(eq(linkPreviews.messageId, messageId))

  return rows
}
