/**
 * Input sanitization utilities.
 *
 * - HTML sanitization using sanitize-html with spec Section 8.4 allowlist.
 * - Filename sanitization for uploaded files.
 * - Null byte stripping from all string inputs.
 */

import sanitize from 'sanitize-html';

/**
 * Allowed HTML tags after Markdown rendering, per spec Section 8.4.
 */
const ALLOWED_TAGS = [
  'b', 'i', 's', 'code', 'pre', 'a', 'ul', 'ol', 'li',
  'blockquote', 'br', 'p', 'em', 'strong',
];

/**
 * Allowed attributes on tags.
 * Only href on <a>, with protocol validation.
 */
const ALLOWED_ATTRIBUTES: sanitize.IOptions['allowedAttributes'] = {
  a: ['href'],
};

/**
 * Only allow http and https protocols in links.
 * Blocks javascript:, data:, vbscript:, file:, etc.
 */
const ALLOWED_SCHEMES = ['http', 'https'];

/**
 * Sanitize HTML content using the allowlisted tags/attributes from spec Section 8.4.
 * This is the server-side primary trust boundary sanitization.
 */
export function sanitizeHtmlContent(input: string): string {
  return sanitize(input, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ALLOWED_SCHEMES,
    // Strip everything not in the allowlist
    disallowedTagsMode: 'discard',
    // Enforce boolean attributes
    enforceHtmlBoundary: false,
    // Do not allow protocol-relative URLs
    allowProtocolRelative: false,
  });
}

/**
 * Sanitize a filename by stripping path separators, null bytes,
 * control characters, and limiting to 255 characters.
 */
export function sanitizeFilename(filename: string): string {
  let sanitized = filename;

  // Strip null bytes
  sanitized = stripNullBytes(sanitized);

  // Remove path separators (forward and backward slashes)
  sanitized = sanitized.replace(/[/\\]/g, '');

  // Remove control characters (U+0000 to U+001F and U+007F to U+009F)
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  // Remove leading dots (prevent hidden files and directory traversal)
  sanitized = sanitized.replace(/^\.+/, '');

  // Collapse multiple dots
  sanitized = sanitized.replace(/\.{2,}/g, '.');

  // Limit to 255 characters
  if (sanitized.length > 255) {
    // Preserve the file extension if possible
    const lastDot = sanitized.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = sanitized.slice(lastDot);
      const name = sanitized.slice(0, 255 - ext.length);
      sanitized = name + ext;
    } else {
      sanitized = sanitized.slice(0, 255);
    }
  }

  // Fallback for empty filenames
  if (!sanitized) {
    sanitized = 'unnamed';
  }

  return sanitized;
}

/**
 * Remove null bytes (\0) from any string input.
 */
export function stripNullBytes(input: string): string {
  return input.replace(/\0/g, '');
}
