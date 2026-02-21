/**
 * Unit tests for sanitize utilities.
 *
 * Tests:
 *   - sanitizeHtmlContent: HTML tag/attribute allowlisting
 *   - sanitizeFilename: Path traversal prevention, length limits
 *   - stripNullBytes: Null byte removal
 */

import { describe, it, expect } from 'vitest'

import {
  sanitizeHtmlContent,
  sanitizeFilename,
  stripNullBytes,
} from '../../../src/lib/sanitize.js'

// ---------------------------------------------------------------------------
// stripNullBytes
// ---------------------------------------------------------------------------

describe('Sanitize — stripNullBytes', () => {
  it('should remove null bytes from a string', () => {
    expect(stripNullBytes('hello\0world')).toBe('helloworld')
  })

  it('should remove multiple null bytes', () => {
    expect(stripNullBytes('\0a\0b\0c\0')).toBe('abc')
  })

  it('should return the same string when no null bytes are present', () => {
    expect(stripNullBytes('clean string')).toBe('clean string')
  })

  it('should return empty string for string of only null bytes', () => {
    expect(stripNullBytes('\0\0\0')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// sanitizeHtmlContent
// ---------------------------------------------------------------------------

describe('Sanitize — sanitizeHtmlContent', () => {
  it('should allow whitelisted tags', () => {
    const input = '<b>bold</b> <i>italic</i> <em>emphasis</em>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<b>bold</b> <i>italic</i> <em>emphasis</em>')
  })

  it('should allow <a> tags with href attribute', () => {
    const input = '<a href="https://example.com">link</a>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<a href="https://example.com">link</a>')
  })

  it('should strip disallowed tags', () => {
    const input = '<div>content</div><span>text</span>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('contenttext')
  })

  it('should strip <script> tags completely', () => {
    const input = '<script>alert("xss")</script>safe text'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('safe text')
  })

  it('should strip <img> tags', () => {
    const input = '<img src="x" onerror="alert(1)">text'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('text')
  })

  it('should block javascript: protocol in href', () => {
    const input = '<a href="javascript:alert(1)">click</a>'
    const result = sanitizeHtmlContent(input)
    expect(result).not.toContain('javascript:')
  })

  it('should block data: protocol in href', () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>'
    const result = sanitizeHtmlContent(input)
    expect(result).not.toContain('data:')
  })

  it('should allow list elements', () => {
    const input = '<ul><li>item 1</li><li>item 2</li></ul>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<ul><li>item 1</li><li>item 2</li></ul>')
  })

  it('should allow ordered lists', () => {
    const input = '<ol><li>first</li><li>second</li></ol>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<ol><li>first</li><li>second</li></ol>')
  })

  it('should allow blockquote tags', () => {
    const input = '<blockquote>quoted text</blockquote>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<blockquote>quoted text</blockquote>')
  })

  it('should allow <code> and <pre> tags', () => {
    const input = '<pre><code>const x = 1</code></pre>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('should allow <br> and <p> tags', () => {
    const input = '<p>paragraph</p><br>new line'
    const result = sanitizeHtmlContent(input)
    expect(result).toContain('<p>paragraph</p>')
    expect(result).toContain('new line')
    // sanitize-html may output <br> or <br /> depending on version
    expect(result).toMatch(/<br\s*\/?>/)
  })

  it('should allow <s> (strikethrough) and <strong> tags', () => {
    const input = '<s>deleted</s> <strong>important</strong>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<s>deleted</s> <strong>important</strong>')
  })

  it('should strip event handler attributes', () => {
    const input = '<b onclick="alert(1)">bold</b>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<b>bold</b>')
    expect(result).not.toContain('onclick')
  })

  it('should strip style attributes', () => {
    const input = '<b style="color:red">text</b>'
    const result = sanitizeHtmlContent(input)
    expect(result).toBe('<b>text</b>')
    expect(result).not.toContain('style')
  })

  it('should handle empty input', () => {
    expect(sanitizeHtmlContent('')).toBe('')
  })

  it('should handle plain text without any HTML', () => {
    expect(sanitizeHtmlContent('just plain text')).toBe('just plain text')
  })
})

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('Sanitize — sanitizeFilename', () => {
  it('should return valid filenames unchanged', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf')
  })

  it('should strip null bytes', () => {
    expect(sanitizeFilename('file\0name.txt')).toBe('filename.txt')
  })

  it('should remove forward slashes', () => {
    expect(sanitizeFilename('path/to/file.txt')).toBe('pathtofile.txt')
  })

  it('should remove backward slashes', () => {
    expect(sanitizeFilename('path\\to\\file.txt')).toBe('pathtofile.txt')
  })

  it('should remove control characters', () => {
    expect(sanitizeFilename('file\x01\x02name.txt')).toBe('filename.txt')
  })

  it('should remove leading dots (prevent hidden files)', () => {
    expect(sanitizeFilename('.htaccess')).toBe('htaccess')
    expect(sanitizeFilename('..secret')).toBe('secret')
  })

  it('should collapse multiple dots', () => {
    expect(sanitizeFilename('file...txt')).toBe('file.txt')
  })

  it('should truncate filenames longer than 255 characters', () => {
    const longName = 'a'.repeat(300) + '.txt'
    const result = sanitizeFilename(longName)
    expect(result.length).toBeLessThanOrEqual(255)
  })

  it('should preserve file extension when truncating', () => {
    const longName = 'a'.repeat(300) + '.pdf'
    const result = sanitizeFilename(longName)
    expect(result).toMatch(/\.pdf$/)
    expect(result.length).toBeLessThanOrEqual(255)
  })

  it('should truncate without extension when no extension exists', () => {
    const longName = 'a'.repeat(300)
    const result = sanitizeFilename(longName)
    expect(result.length).toBe(255)
  })

  it('should return "unnamed" for empty filenames', () => {
    expect(sanitizeFilename('')).toBe('unnamed')
  })

  it('should return "unnamed" when filename becomes empty after sanitization', () => {
    expect(sanitizeFilename('...')).toBe('unnamed')
  })

  it('should handle directory traversal attempts', () => {
    const result = sanitizeFilename('../../../etc/passwd')
    expect(result).not.toContain('/')
    expect(result).not.toContain('..')
  })
})
