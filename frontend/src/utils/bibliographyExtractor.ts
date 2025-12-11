import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import { visit } from 'unist-util-visit'
import { toString } from 'mdast-util-to-string'
import type { Root, List, ListItem, Heading, Link, Html } from 'mdast'

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter)

function normalizeUrl(url: string): string {
  try {
    const unescaped = url
      .trim()
      .replace(/\\([\\_\-*[\](){}#.!+`~|&])/g, '$1')
    const parsed = new URL(unescaped)
    parsed.hash = ''
    const normalised = parsed.toString()
    return normalised.endsWith('/') ? normalised.slice(0, -1) : normalised
  } catch {
    return url.trim().replace(/\\([_\-*[\](){}#.!+`~|])/g, '$1')
  }
}

function extractUrlFromListItem(listItem: ListItem): string | undefined {
  let extracted: string | undefined

  // First try to find actual link nodes (ignore internal #bib-* citation links)
  visit(listItem, 'link', (node: Link) => {
    if (!extracted && typeof node.url === 'string' && node.url.trim().length > 0) {
      if (/^#bib-\d+$/.test(node.url)) {
        return
      }
      if (/^https?:\/\//i.test(node.url)) {
        extracted = normalizeUrl(node.url)
      }
    }
  })

  if (extracted) {
    return extracted
  }

  // Then check HTML nodes (for re-processed files with anchor tags)
  visit(listItem, 'html', (node: Html) => {
    if (!extracted && node.value) {
      const match = node.value.match(/https?:\/\/[^\s<>\]")'}]+/i)
      if (match) {
        extracted = normalizeUrl(match[0])
      }
    }
  })

  if (extracted) {
    return extracted
  }

  // Finally try to extract from text content
  const textValue = toString(listItem)
  const match = textValue.match(/https?:\/\/[^\s<>\]")'}]+/i)
  if (match) {
    return normalizeUrl(match[0])
  }

  return undefined
}

function findSectionRange(root: Root, headingText: string): { startIndex: number; endIndex: number } | null {
  const target = headingText.trim().toLowerCase()
  const children = root.children

  for (let i = 0; i < children.length; i += 1) {
    const node = children[i]
    if (node.type === 'heading' && toString(node).trim().toLowerCase() === target) {
      const depth = (node as Heading).depth
      let endIndex = children.length
      for (let j = i + 1; j < children.length; j += 1) {
        const candidate = children[j]
        if (
          candidate.type === 'heading' &&
          (candidate as Heading).depth <= depth
        ) {
          endIndex = j
          break
        }
      }

      return { startIndex: i, endIndex }
    }
  }

  return null
}

export interface ExtractedBibliographyEntry {
  url: string
  citationText: string
  metadata?: {
    title?: string
    authors?: string
    siteName?: string
    accessDate?: string
  }
}

function parseExistingCitationMetadata(citationText: string, url: string): {
  title?: string
  authors?: string
  siteName?: string
  accessDate?: string
} {
  let cleaned = citationText
    .replace(/^\d+\.\s*/, '')
    .replace(/<[^>]+>/g, '')
    .replace(url, '')
    .replace(/https?:\/\/[^\s<>\]")'}]+/gi, '')
    .trim()
  
  const metadata: {
    title?: string
    authors?: string
    siteName?: string
    accessDate?: string
  } = {}

  // Extract date
  const datePatterns = [
    /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b)/i,
    /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b)/i,
    /(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b)/i,
    /(\b\d{4}\b)/
  ]
  
  for (const pattern of datePatterns) {
    const dateMatch = cleaned.match(pattern)
    if (dateMatch) {
      metadata.accessDate = dateMatch[1].trim()
      cleaned = cleaned.replace(dateMatch[0], '').trim()
      break
    }
  }
  
  cleaned = cleaned.replace(/\b(?:Accessed|Retrieved|Viewed)(?:\s*[.,;:])*\s*$/i, '').trim()

  // Extract authors
  const authorPatterns = [
    /^([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)?(?:\s*,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)?)*(?:\s*,?\s+and\s+[A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)?)?)\.\s+/,
    /^([A-Z][a-z]+(?:\s+[A-Z]\.?\s*)?(?:\s+[A-Z][a-z]+)?)\.\s+/,
    /^([A-Z][a-z]+(?:\s+[A-Z]\.)+\s+[A-Z][a-z]+)\.\s+/
  ]
  
  for (const pattern of authorPatterns) {
    const authorMatch = cleaned.match(pattern)
    if (authorMatch) {
      metadata.authors = authorMatch[1].trim()
      cleaned = cleaned.replace(authorMatch[0], '').trim()
      break
    }
  }

  // Extract title
  const titleMatch = cleaned.match(/"([^"]+)"|'([^']+)'|\*([^*]+)\*|_([^_]+)_/)
  if (titleMatch) {
    metadata.title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4])
      .trim()
      .replace(/[.,;:]+$/, '')
    cleaned = cleaned.replace(titleMatch[0], '').trim()
  }

  // Remaining text is siteName
  if (cleaned.length > 0 && cleaned.length < 200) {
    cleaned = cleaned.replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim()
    if (cleaned.length > 0) {
      metadata.siteName = cleaned
    }
  }

  return metadata
}

/**
 * Extracts bibliography entries from a markdown document
 * Looks for a "Bibliography" section and extracts all entries with their URLs and metadata
 */
export function extractBibliographyFromMarkdown(markdown: string): ExtractedBibliographyEntry[] {
  const tree = processor.parse(markdown) as Root
  const entries: ExtractedBibliographyEntry[] = []

  // Find bibliography section
  const bibliographyRange = findSectionRange(tree, 'bibliography')
  if (!bibliographyRange) {
    return entries
  }

  // Look for the list within the bibliography section
  const sectionNodes = tree.children.slice(bibliographyRange.startIndex + 1, bibliographyRange.endIndex)
  const bibliographyList = sectionNodes.find((node): node is List => node.type === 'list')
  
  if (!bibliographyList) {
    return entries
  }

  // Extract each bibliography entry
  bibliographyList.children.forEach((listItem) => {
    const item = listItem as ListItem
    const url = extractUrlFromListItem(item)
    
    if (url) {
      const citationText = toString(item).trim()
      const metadata = parseExistingCitationMetadata(citationText, url)
      
      entries.push({
        url,
        citationText,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      })
    }
  })

  return entries
}
