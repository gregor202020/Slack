'use client'

import { useMemo, type ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FormattedMessageProps {
  body: string
}

interface ParsedNode {
  type:
    | 'text'
    | 'bold'
    | 'italic'
    | 'strikethrough'
    | 'code'
    | 'code_block'
    | 'blockquote'
    | 'link'
    | 'mention'
    | 'line_break'
    | 'list_item'
  content?: string
  children?: ParsedNode[]
  href?: string
}

// ---------------------------------------------------------------------------
// XSS-safe HTML entity escaping
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch)
}

// ---------------------------------------------------------------------------
// URL detection regex
// ---------------------------------------------------------------------------

const URL_REGEX = /https?:\/\/[^\s<>[\]()'"]+(?:\([^\s<>[\]()'"]*\))?[^\s<>[\]()'".,;:!?]/g

// ---------------------------------------------------------------------------
// Inline parsing — converts a string into an array of ParsedNodes
// ---------------------------------------------------------------------------

function parseInline(text: string): ParsedNode[] {
  const escaped = escapeHtml(text)
  const nodes: ParsedNode[] = []

  // Combined regex for all inline patterns
  // Order matters: code first (no nesting), then bold, italic, strikethrough, links, mentions, URLs
  const inlinePattern =
    /(`([^`]+?)`)|(\*\*(.+?)\*\*)|(__(.+?)__)|(\*(.+?)\*)|(_([^_]+?)_)|(~~(.+?)~~)|(\[([^\]]+?)\]\(([^)]+?)\))|(@(channel|here|[a-zA-Z0-9_]+))|(https?:\/\/[^\s&lt;&gt;\[\]()&#x27;&quot;]+(?:\([^\s&lt;&gt;\[\]()&#x27;&quot;]*\))?[^\s&lt;&gt;\[\]()&#x27;&quot;.,;:!?])/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlinePattern.exec(escaped)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      nodes.push({ type: 'text', content: escaped.slice(lastIndex, match.index) })
    }

    if (match[1]) {
      // Inline code: `code`
      nodes.push({ type: 'code', content: match[2] })
    } else if (match[3]) {
      // Bold: **text**
      nodes.push({ type: 'bold', content: match[4] })
    } else if (match[5]) {
      // Bold: __text__
      nodes.push({ type: 'bold', content: match[6] })
    } else if (match[7]) {
      // Italic: *text*
      nodes.push({ type: 'italic', content: match[8] })
    } else if (match[9]) {
      // Italic: _text_
      nodes.push({ type: 'italic', content: match[10] })
    } else if (match[11]) {
      // Strikethrough: ~~text~~
      nodes.push({ type: 'strikethrough', content: match[12] })
    } else if (match[13]) {
      // Markdown link: [text](url)
      nodes.push({ type: 'link', content: match[14], href: match[15] })
    } else if (match[16]) {
      // @mention
      nodes.push({ type: 'mention', content: match[16] })
    } else if (match[18]) {
      // Bare URL
      nodes.push({ type: 'link', content: match[18], href: match[18] })
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < escaped.length) {
    nodes.push({ type: 'text', content: escaped.slice(lastIndex) })
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Block-level parsing — handles code blocks, blockquotes, lists
// ---------------------------------------------------------------------------

function parseBlocks(text: string): ParsedNode[] {
  const nodes: ParsedNode[] = []
  const lines = text.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Code blocks: ```
    if (line.trimStart().startsWith('```')) {
      const codeLines: string[] = []
      i++ // skip opening ```
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        codeLines.push(lines[i]!)
        i++
      }
      i++ // skip closing ```
      nodes.push({ type: 'code_block', content: codeLines.join('\n') })
      continue
    }

    // Blockquote: > text
    if (line.startsWith('&gt; ') || line === '&gt;') {
      const quoteLines: string[] = []
      while (
        i < lines.length &&
        (lines[i]!.startsWith('&gt; ') || lines[i] === '&gt;')
      ) {
        quoteLines.push(
          lines[i]!.startsWith('&gt; ')
            ? lines[i]!.slice(5)
            : '',
        )
        i++
      }
      nodes.push({
        type: 'blockquote',
        children: parseInline(quoteLines.join('\n')),
      })
      continue
    }

    // Unordered list: - item or * item
    if (/^[-*] /.test(line)) {
      nodes.push({
        type: 'list_item',
        children: parseInline(line.slice(2)),
      })
      i++
      continue
    }

    // Regular text line
    if (line === '') {
      nodes.push({ type: 'line_break' })
    } else {
      const inlineNodes = parseInline(line)
      nodes.push(...inlineNodes)
      // Add line break if not the last line
      if (i < lines.length - 1) {
        nodes.push({ type: 'line_break' })
      }
    }
    i++
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Rendering — converts ParsedNode[] to React elements
// ---------------------------------------------------------------------------

function renderNode(node: ParsedNode, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return (
        <span key={key} dangerouslySetInnerHTML={{ __html: node.content ?? '' }} />
      )

    case 'bold':
      return (
        <strong key={key} className="font-semibold">
          <span dangerouslySetInnerHTML={{ __html: node.content ?? '' }} />
        </strong>
      )

    case 'italic':
      return (
        <em key={key}>
          <span dangerouslySetInnerHTML={{ __html: node.content ?? '' }} />
        </em>
      )

    case 'strikethrough':
      return (
        <del key={key} className="text-smoke-400">
          <span dangerouslySetInnerHTML={{ __html: node.content ?? '' }} />
        </del>
      )

    case 'code':
      return (
        <code
          key={key}
          className="rounded bg-smoke-700 px-1 py-0.5 text-[0.85em] font-mono text-smoke-200"
        >
          <span dangerouslySetInnerHTML={{ __html: node.content ?? '' }} />
        </code>
      )

    case 'code_block':
      return (
        <pre
          key={key}
          className="my-1 rounded-md bg-smoke-700 p-3 overflow-x-auto"
        >
          <code className="text-[0.85em] font-mono text-smoke-200 whitespace-pre">
            <span dangerouslySetInnerHTML={{ __html: escapeHtml(node.content ?? '') }} />
          </code>
        </pre>
      )

    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="my-1 border-l-2 border-smoke-500 pl-3 text-smoke-300 italic"
        >
          {node.children?.map((child, i) => renderNode(child, i))}
        </blockquote>
      )

    case 'link': {
      // Decode the escaped HTML entities back for the href
      const decodedHref = (node.href ?? '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")

      return (
        <a
          key={key}
          href={decodedHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand underline hover:text-brand-hover transition-colors"
        >
          <span dangerouslySetInnerHTML={{ __html: node.content ?? '' }} />
        </a>
      )
    }

    case 'mention':
      return (
        <span
          key={key}
          className="rounded bg-brand/20 px-1 py-0.5 text-brand font-medium"
        >
          {node.content}
        </span>
      )

    case 'line_break':
      return <br key={key} />

    case 'list_item':
      return (
        <div key={key} className="flex items-start gap-1.5 my-0.5">
          <span className="text-smoke-400 select-none mt-px">&bull;</span>
          <span>
            {node.children?.map((child, i) => renderNode(child, i))}
          </span>
        </div>
      )

    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormattedMessage({ body }: FormattedMessageProps) {
  const rendered = useMemo(() => {
    const nodes = parseBlocks(body)
    return nodes.map((node, i) => renderNode(node, i))
  }, [body])

  return (
    <div className="text-sm text-smoke-200 whitespace-pre-wrap break-words">
      {rendered}
    </div>
  )
}
