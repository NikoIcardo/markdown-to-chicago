import { format } from 'date-fns'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import { visit, SKIP } from 'unist-util-visit'
import { visitParents } from 'unist-util-visit-parents'
import { toString } from 'mdast-util-to-string'
import yaml from 'js-yaml'
import type {
  Code,
  Content,
  Definition,
  Heading,
  Html,
  Link,
  LinkReference,
  List,
  ListItem,
  Parent,
  Paragraph,
  PhrasingContent,
  Root,
  Text,
  Yaml,
} from 'mdast'
import type { Node } from 'unist'
import type {
  BibliographyEntry,
  ManualMetadataInput,
  MetadataIssue,
  ProcessedMarkdown,
  ProcessingDiagnostics,
  SourceMetadata,
} from './types.ts'

const MARKDOWN_URL_REGEX = /(https?:\/\/[^\s<>\]")"}]+)/gi

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter)

function parseListItemsFromMarkdown(markdown: string): ListItem[] {
  const trimmed = markdown.trim()
  if (!trimmed) {
    return []
  }

  const parsed = processor.parse(`${trimmed}\n`) as Root
  const items: ListItem[] = []

  parsed.children.forEach((child) => {
    if (child.type === 'list') {
      ;(child as List).children.forEach((listItem) => {
        const clonedItem = cloneNode(listItem as ListItem)
        clonedItem.spread = false
        clonedItem.children = clonedItem.children.map((listChild) => {
          if (listChild.type === 'paragraph') {
            stripLeadingListNumber(listChild as Paragraph)
          }
          return listChild
        })
        items.push(clonedItem)
      })
    } else if (child.type === 'paragraph') {
      const listItem = createListItemFromParagraph(child as Paragraph)
      if (listItem) {
        items.push(listItem)
      }
    }
  })

  return items
}

function normalizeTableOfContents(root: Root) {
  const tocRange = findSectionRange(root, 'table of contents')
  if (!tocRange) {
    return
  }

  const sectionNodes = root.children.slice(tocRange.startIndex + 1, tocRange.endIndex)
  if (!sectionNodes.length) {
    return
  }

  const normalizedList: List = {
    type: 'list',
    ordered: true,
    spread: false,
    start: 1,
    children: [],
  }

  const trailingNodes: Content[] = []
  let currentTopLevelItem: ListItem | null = null

  const addTopLevelItem = (item: ListItem) => {
    const clonedItem = cloneNode(item)
    clonedItem.spread = false
    clonedItem.children = clonedItem.children.map((child) => {
      if (child.type === 'paragraph') {
        stripLeadingListNumber(child as Paragraph)
      }
      return child
    })
    normalizedList.children.push(clonedItem)
    currentTopLevelItem = clonedItem
  }

  const appendNestedItems = (items: ListItem[]) => {
    if (!items.length) {
      return
    }

    if (!currentTopLevelItem) {
      items.forEach(addTopLevelItem)
      return
    }

    let nestedList = currentTopLevelItem.children.find(
      (child): child is List => child.type === 'list',
    )

    if (!nestedList) {
      nestedList = {
        type: 'list',
        ordered: true,
        spread: false,
        children: [],
      }
      currentTopLevelItem.children.push(nestedList)
    }

    items.forEach((item) => {
      const clonedItem = cloneNode(item)
      clonedItem.spread = false
      clonedItem.children = clonedItem.children.map((child) => {
        if (child.type === 'paragraph') {
          stripLeadingListNumber(child as Paragraph)
        }
        return child
      })
      nestedList!.children.push(clonedItem)
    })
  }

  sectionNodes.forEach((node) => {
    if (node.type === 'list') {
      ;(node as List).children.forEach((item) => addTopLevelItem(item as ListItem))
      return
    }

    if (node.type === 'paragraph') {
      const listItem = createListItemFromParagraph(node as Paragraph)
      if (listItem) {
        addTopLevelItem(listItem)
      }
      return
    }

    if (node.type === 'code') {
      const nestedItems = parseListItemsFromMarkdown((node as Code).value)
      appendNestedItems(nestedItems)
      return
    }

    trailingNodes.push(node as Content)
  })

  if (!normalizedList.children.length) {
    return
  }

  const replacementNodes: Content[] = [normalizedList, ...trailingNodes]
  root.children.splice(
    tocRange.startIndex + 1,
    tocRange.endIndex - tocRange.startIndex - 1,
    ...replacementNodes,
  )
}

function ensureBibliographyInTableOfContents(root: Root) {
  const tocRange = findSectionRange(root, 'table of contents')
  if (!tocRange) {
    return
  }

  const tocNodes = collectNodesInRange(root, tocRange)
  const tocList = tocNodes.find((node): node is List => node.type === 'list')
  if (!tocList) {
    return
  }

  const alreadyPresent = tocList.children.some((item) => {
    const text = toString(item).trim().toLowerCase()
    return text === 'bibliography' || text.includes('bibliography')
  })

  if (alreadyPresent) {
    return
  }

  const bibliographyListItem: ListItem = {
    type: 'listItem',
    spread: false,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: '#bibliography',
            children: [{ type: 'text', value: 'Bibliography' }],
          },
        ],
      } as Paragraph,
    ],
  }

  tocList.children.push(bibliographyListItem)
}

type SectionRange = {
  startIndex: number
  endIndex: number
  depth: number
}

type UrlOccurrence =
  | {
  type: 'link'
  node: Link | LinkReference
      parent: Parent
      index: number
    }
  | {
      type: 'bare'
      node: Text
      parent: Parent
      index: number
      matches: Array<{ start: number; end: number }>
    }

type ExistingEntryInfo = {
  number: number
  normalizedUrl?: string
  listItem: ListItem
  anchorId: string
  sourceType: 'existing' | 'fetched' | 'manual'
  metadata?: SourceMetadata
  firstOccurrence: number
  originalIndex: number
  isNew: boolean
}

const excludedAncestorTypes = new Set(['code', 'inlineCode', 'definition'])

function normalizeUrl(url: string): string {
  try {
    // Remove Markdown escape sequences (e.g., \_, \-, \&, etc.) before parsing
    const unescaped = url
      .trim()
      .replace(/\\([\\_\-*[\](){}#.!+`~|&])/g, '$1')
    const parsed = new URL(unescaped)
    parsed.hash = ''
    const normalised = parsed.toString()
    return normalised.endsWith('/') ? normalised.slice(0, -1) : normalised
  } catch {
    // If URL parsing fails, still remove escape sequences from the raw string
    return url.trim().replace(/\\([_\-*[\](){}#.!+`~|])/g, '$1')
  }
}

function stripTrailingPunctuationFromUrl(value: string): string {
  let result = value.trim()
  const removable = '.,;:!?\'"'
  const pairLookup: Record<string, string> = {
    ')': '(',
    ']': '[',
    '}': '{',
  }

  while (result.length > 0) {
    const lastChar = result[result.length - 1]
    if (removable.includes(lastChar)) {
      result = result.slice(0, -1)
      continue
    }

    const counterpart = pairLookup[lastChar]
    if (counterpart) {
      const openCount = (result.match(new RegExp(`\\${counterpart}`, 'g')) || []).length
      const closeCount = (result.match(new RegExp(`\\${lastChar}`, 'g')) || []).length
      if (closeCount > openCount) {
        result = result.slice(0, -1)
        continue
      }
    }

    break
  }

  return result
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function findSectionRange(root: Root, headingText: string): SectionRange | null {
  const target = headingText.trim().toLowerCase()
  const children = root.children

  for (let i = 0; i < children.length; i += 1) {
    const node = children[i]
    if (node.type === 'heading' && toString(node).trim().toLowerCase() === target) {
      const depth = node.depth
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

      return { startIndex: i, endIndex, depth }
    }
  }

  return null
}

function collectNodesInRange(root: Root, range: SectionRange): Node[] {
  const nodes: Node[] = []
  const { startIndex, endIndex } = range

  for (let i = startIndex; i < endIndex; i += 1) {
    nodes.push(root.children[i] as Node)
  }

  return nodes
}

function cloneNode<T>(node: T): T {
  return JSON.parse(JSON.stringify(node))
}

function stripLeadingListNumber(paragraph: Paragraph) {
  while (paragraph.children.length) {
    const firstChild = paragraph.children[0]
    if (firstChild.type !== 'text') {
      break
    }

    const textNode = firstChild as Text
    const match = textNode.value.match(/^\s*(\d+)\.\s*/)
    if (match) {
      const remaining = textNode.value.slice(match[0].length)
      if (remaining) {
        textNode.value = remaining
      } else {
        paragraph.children.shift()
      }
    } else if (textNode.value.trim() === '') {
      paragraph.children.shift()
    } else {
      break
    }
  }
}

function createListItemFromParagraph(paragraph: Paragraph): ListItem | null {
  const clonedParagraph = cloneNode(paragraph)
  stripLeadingListNumber(clonedParagraph)

  if (!clonedParagraph.children.length) {
    return null
  }

  return {
    type: 'listItem',
    spread: false,
    children: [clonedParagraph],
  }
}

function extractUrlFromListItem(listItem: ListItem): string | undefined {
  let extracted: string | undefined

  // First try to find actual link nodes (ignore internal #bib-* citation links)
  visit(listItem, 'link', (node: Link) => {
    if (!extracted && typeof node.url === 'string' && node.url.trim().length > 0) {
      // Skip internal citation links
      if (/^#bib-\d+$/.test(node.url)) {
        return
      }
      // Only accept absolute http(s) URLs
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
        extracted = normalizeUrl(stripTrailingPunctuationFromUrl(match[0]))
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
    return normalizeUrl(stripTrailingPunctuationFromUrl(match[0]))
  }

  return undefined
}

function parseExistingCitationMetadata(citationText: string, url: string): {
  title?: string
  authors?: string
  siteName?: string
  accessDate?: string
} {
  // Remove list numbering, HTML tags (especially anchor tags like <a id="bib-1"></a>), and URLs from the text
  let cleaned = citationText
    .replace(/^\d+\.\s*/, '')
    .replace(/<[^>]+>/g, '') // Strip all HTML tags
    .replace(url, '')
    .replace(/https?:\/\/[^\s<>\]")'}]+/gi, '')
    .trim()
  
  const metadata: {
    title?: string
    authors?: string
    siteName?: string
    accessDate?: string
  } = {}

  // Try to extract title FIRST (text in quotes or italics) before stripping keywords
  const titleMatch = cleaned.match(/"([^"]+)"|'([^']+)'|\*([^*]+)\*|_([^_]+)_/)
  if (titleMatch) {
    metadata.title = (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4])
      .trim()
      .replace(/[.,;:]+$/, '') // Remove trailing punctuation
    cleaned = cleaned.replace(titleMatch[0], '').trim()
  }

  // Try to extract date (various formats)
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
  
  // Now remove standalone "Accessed" keyword that appears before the date (now just leftover marker)
  // Strip only at the end to avoid corrupting site names that start with these words
  // Allow multiple trailing punctuation marks (e.g., "Accessed . ." after URL removal)
  cleaned = cleaned.replace(/\b(?:Accessed|Retrieved|Viewed)(?:\s*[.,;:])*\s*$/i, '').trim()

  // Try to extract authors (names before title, often with periods or commas)
  const authorMatch = cleaned.match(/^([A-Z][a-z]+(?:,?\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?(?:\s*,\s*[A-Z][a-z]+(?:,?\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)?)*)[.,]/)
  if (authorMatch) {
    metadata.authors = authorMatch[1].trim()
    cleaned = cleaned.replace(authorMatch[0], '').trim()
  }

  // If no title was found yet and we have remaining text, treat it as the title
  if (!metadata.title && cleaned.length > 0 && cleaned.length < 200) {
    // Remove common punctuation from beginning and end
    cleaned = cleaned.replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim()
    if (cleaned.length > 0) {
      metadata.title = cleaned
      cleaned = '' // Clear so it doesn't also get assigned to siteName
    }
  }

  // Any additional remaining text might be publisher/site name
  if (cleaned.length > 0 && cleaned.length < 100) {
    cleaned = cleaned.replace(/^[.,;:\s]+|[.,;:\s]+$/g, '').trim()
    if (cleaned.length > 0) {
      metadata.siteName = cleaned
    }
  }

  return metadata
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) {
    return 0
  }
  const regex = new RegExp(escapeRegExp(needle), 'gi')
  return haystack.match(regex)?.length ?? 0
}

function buildIncompleteCitationIssue(
  listItem: ListItem,
  normalizedUrl: string,
): MetadataIssue | null {
  const citationText = toString(listItem).trim()
  if (!citationText) {
    return {
      url: normalizedUrl,
      message: 'Incomplete citation entry. Please add title, authors, and other details.',
    }
  }

  const urlOccurrences = countOccurrences(citationText, normalizedUrl)
  const cleanedCitation = citationText
    .replace(/^\d+\.\s*/, '')
    .replace(/^(?:\[\d+\]|\(\d+\))?\s*/, '')
    .trim()

  const normalizedWithoutProtocol = normalizedUrl.replace(/^https?:\/\//, '')

  const partialMetadata = parseExistingCitationMetadata(citationText, normalizedUrl)
  const inferredTitle = partialMetadata.title?.trim() ?? ''
  const titleLooksLikeUrl =
    !inferredTitle ||
    /^https?:\/\//i.test(inferredTitle) ||
    inferredTitle.toLowerCase() === normalizedUrl.toLowerCase() ||
    inferredTitle.toLowerCase().includes(normalizedWithoutProtocol.toLowerCase())

  const minimalCitation =
    cleanedCitation === normalizedUrl ||
    cleanedCitation.includes(normalizedWithoutProtocol) ||
    cleanedCitation.length < normalizedUrl.length + 20

  const shouldFlag = urlOccurrences > 1 || titleLooksLikeUrl || minimalCitation

  if (!shouldFlag) {
    return null
  }

  return {
    url: normalizedUrl,
    message: 'Incomplete citation entry. Please add title, authors, and other details.',
    partialMetadata,
  }
}

function removeInitialHeadingMatchingTitle(tree: Root, title?: string | null): boolean {
  if (!title) {
    return false
  }
  const normalizedTitle = title.trim().toLowerCase()
  if (!normalizedTitle) {
    return false
  }

  for (let i = 0; i < tree.children.length; i += 1) {
    const node = tree.children[i]
    if (
      node.type === 'heading' &&
      (node as Heading).depth === 1 &&
      toString(node as Heading).trim().toLowerCase() === normalizedTitle
    ) {
      tree.children.splice(i, 1)
      return true
    }
  }

  return false
}

function addSubtreeToSet(node: Node, set: WeakSet<Node>) {
  const stack: Node[] = [node]

  while (stack.length) {
    const current = stack.pop()!
    if (set.has(current)) {
      continue
    }
    set.add(current)

    if ('children' in current && Array.isArray((current as Parent).children)) {
      stack.push(...(((current as Parent).children as Node[]) || []))
    }
  }
}

function ensureListItemAnchor(listItem: ListItem, anchorId: string) {
  // Remove existing anchor IDs from HTML nodes to prevent duplicates on re-upload
  listItem.children = listItem.children.map((child) => {
    if (child.type === 'html') {
      const htmlNode = child as Html
      // Remove complete anchors, split tags, and empty anchors
      htmlNode.value = htmlNode.value
        .replace(/<a\s+id="bib-\d+">\s*<\/a>/gi, '') // Complete anchor with ID
        .replace(/<a\s+id="">\s*<\/a>/gi, '')         // Empty anchor
        .replace(/<a\s+id="bib-\d+">/gi, '')          // Opening tag only
        .replace(/^\s*<\/a>\s*$/gi, '')                // Standalone closing tag
      return htmlNode
    }
    return child
  }).filter((child) => {
    if (child.type === 'html') {
      return (child as Html).value.trim().length > 0
    }
    return true
  })
  
  // Also remove anchors from inside paragraphs (including text nodes)
  listItem.children.forEach((child) => {
    if (child.type === 'paragraph') {
      const paragraph = child as Paragraph
      paragraph.children = paragraph.children.map((pChild) => {
        if (pChild.type === 'html') {
          const htmlNode = pChild as Html
          // Remove complete anchors, split tags, and empty anchors
          htmlNode.value = htmlNode.value
            .replace(/<a\s+id="bib-\d+">\s*<\/a>/gi, '') // Complete anchor with ID
            .replace(/<a\s+id="">\s*<\/a>/gi, '')         // Empty anchor
            .replace(/<a\s+id="bib-\d+">/gi, '')          // Opening tag only
            .replace(/^\s*<\/a>\s*$/gi, '')                // Standalone closing tag
          return htmlNode
        }
        if (pChild.type === 'text') {
          const textNode = pChild as Text
          // Remove complete anchors, split tags, and empty anchors from text nodes
          textNode.value = textNode.value
            .replace(/<a\s+id="bib-\d+">\s*<\/a>/gi, '')
            .replace(/<a\s+id="">\s*<\/a>/gi, '')
            .replace(/<a\s+id="bib-\d+">/gi, '')
            .replace(/^\s*<\/a>\s*$/gi, '')
          return textNode
        }
        return pChild
      }).filter((pChild) => {
        if (pChild.type === 'html') {
          return (pChild as Html).value.trim().length > 0
        }
        if (pChild.type === 'text') {
          const textNode = pChild as Text
          return textNode.value.trim().length > 0
        }
        return true
      })
    }
  })

  const firstParagraph = listItem.children.find(
    (child): child is Paragraph => child.type === 'paragraph',
  )

  if (!firstParagraph) {
    const paragraph: Paragraph = {
      type: 'paragraph',
      children: [],
    }
    listItem.children.unshift(paragraph)
    paragraph.children.unshift({
      type: 'html',
      value: `<a id="${anchorId}"></a>`,
    } as Html)
    return
  }

  // Insert new anchor at the beginning
  const anchorNode: Html = {
    type: 'html',
    value: `<a id="${anchorId}"></a>`,
  }
  firstParagraph.children.unshift(anchorNode)
}

function formatAuthors(authors: string[]): string {
  if (!authors.length) return ''
  if (authors.length === 1) return `${authors[0]}.`
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}.`

  const [first, ...rest] = authors
  const last = rest.pop()
  return `${first}, ${rest.join(', ')}, and ${last}.`
}

function formatCitationText(metadata: SourceMetadata): string {
  const parts: string[] = []
  const authorsPart = formatAuthors(metadata.authors)
  if (authorsPart) {
    parts.push(authorsPart)
  }

  const quotedTitle = metadata.title ? `"${metadata.title}."` : ''
  if (quotedTitle) {
    parts.push(quotedTitle)
  }

  const site = metadata.siteName || ''
  if (site) {
    parts.push(`${site}.`)
  }

  parts.push(`Accessed ${metadata.accessDate}.`)

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function buildCitationContent(metadata: SourceMetadata): PhrasingContent[] {
  const nodes: PhrasingContent[] = []
  const prefix = formatCitationText(metadata)
  if (prefix) {
    nodes.push({
      type: 'text',
      value: `${prefix} `,
    } as Text)
  }
  nodes.push({
    type: 'link',
    url: metadata.url,
    children: [{ type: 'text', value: metadata.url } as Text],
  } as Link)
  nodes.push({
    type: 'text',
    value: '.',
  } as Text)
  return nodes
}

function createReferenceNode(number: number, anchorId: string): Html {
  // Use raw HTML to preserve the citation-link class through remark-stringify
  return {
    type: 'html',
    value: `<a href="#${anchorId}" class="citation-link">[${number}]</a>`,
  } as Html
}

function extractHeadings(root: Root): { title: string; subtitle: string; headings: ProcessedMarkdown['headings'] } {
  const headings: ProcessedMarkdown['headings'] = []
  let title = ''
  let subtitle = ''

  // First, try to extract title and subtitle from YAML frontmatter
  visit(root, 'yaml', (node: Yaml) => {
    try {
      const frontmatter = yaml.load(node.value) as {
        title?: string
        subtitle?: string
      } | null
      if (frontmatter) {
        if (typeof frontmatter.title === 'string') {
          title = frontmatter.title
        }
        if (
          typeof frontmatter.subtitle === 'string' &&
          frontmatter.subtitle.toLowerCase() !== 'table of contents'
        ) {
          subtitle = frontmatter.subtitle
        }
      }
    } catch (error) {
      console.warn('Failed to parse YAML frontmatter:', error)
    }
  })

  // Extract headings (but not as fallback title)
  visit(root, 'heading', (node: Heading) => {
    const text = toString(node).trim()
    // Only use first H1 as fallback title if no frontmatter title
    if (!title && node.depth === 1) {
      title = text
    }
    headings.push({
      depth: node.depth,
      text,
      slug: slugify(text),
    })
  })

  return { title, subtitle, headings }
}

interface ProcessMarkdownOptions {
  manualMetadata?: Record<string, ManualMetadataInput>
}

function removeExistingCitationReferences(root: Root) {
  visit(root, 'html', (node, index, parent) => {
    if (
      typeof node.value === 'string' &&
      node.value.includes('class="citation-link"') &&
      parent &&
      typeof index === 'number'
    ) {
      ;(parent as Parent).children.splice(index, 1)
      return [SKIP, index]
    }
    return undefined
  })
}

function findStandaloneBibliographyList(root: Root): { index: number; list: List } | null {
  for (let i = 0; i < root.children.length; i += 1) {
    const node = root.children[i]
    if (node.type === 'list') {
      const list = node as List
      const isBibliographyLike = list.children.every((item) => {
        const textValue = toString(item)
        return /id="bib-\d+"/i.test(textValue)
      })
      if (isBibliographyLike) {
        return { index: i, list }
      }
    }
  }
  return null
}

export async function processMarkdown(
  markdown: string,
  options: ProcessMarkdownOptions = {},
): Promise<ProcessedMarkdown> {
  const tree = processor.parse(markdown) as Root
  removeExistingCitationReferences(tree)
  normalizeTableOfContents(tree)
  const diagnostics: ProcessingDiagnostics = { warnings: [], errors: [] }
  const metadataIssues: MetadataIssue[] = []
  const pendingExistingMetadataIssues: Array<{ issue: MetadataIssue; normalizedUrl?: string }> = []

  const manualMetadataMap = new Map<string, ManualMetadataInput>()
  if (options.manualMetadata) {
    Object.values(options.manualMetadata).forEach((entry) => {
      if (!entry) return
      const key = normalizeUrl(entry.url)
      manualMetadataMap.set(key, {
        ...entry,
        url: entry.url,
      })
    })
  }

  let mainHeadingDepth = Infinity
  visit(tree, 'heading', (node: Heading) => {
    if (node.depth < mainHeadingDepth) {
      mainHeadingDepth = node.depth
    }
  })
  if (!Number.isFinite(mainHeadingDepth)) {
    mainHeadingDepth = 1
  }

  const normalizedHeadingDepth = Math.min(Math.max(mainHeadingDepth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6

  const tableOfContentsRange = findSectionRange(tree, 'table of contents')
  const excludedNodes = new WeakSet<Node>()
  if (tableOfContentsRange) {
    collectNodesInRange(tree, tableOfContentsRange).forEach((node) =>
      addSubtreeToSet(node, excludedNodes),
    )
  }

  const rootChildren = tree.children as Content[]
  const existingBibliographyRange = findSectionRange(tree, 'bibliography')
  let existingBibliographyItems: ListItem[] = []
  let insertIndex = rootChildren.length

  if (existingBibliographyRange) {
    const existingNodes = collectNodesInRange(tree, existingBibliographyRange)
    const existingList = existingNodes.find((node): node is List => node.type === 'list')
    if (existingList) {
      existingBibliographyItems = existingList.children as ListItem[]
    }
    rootChildren.splice(
      existingBibliographyRange.startIndex,
      existingBibliographyRange.endIndex - existingBibliographyRange.startIndex,
    )
    insertIndex = existingBibliographyRange.startIndex
  } else {
    const standaloneList = findStandaloneBibliographyList(tree)
    if (standaloneList) {
      existingBibliographyItems = standaloneList.list.children as ListItem[]
      rootChildren.splice(standaloneList.index, 1)
      insertIndex = standaloneList.index
    }
  }

  const bibliographyHeading: Heading = {
    type: 'heading',
    depth: normalizedHeadingDepth,
    children: [{ type: 'text', value: 'Bibliography' }],
  }

  const bibliographyList: List = {
    type: 'list',
    ordered: true,
    spread: false,
    start: 1,
    children: [],
  }

  rootChildren.splice(insertIndex, 0, bibliographyHeading, bibliographyList)

  const bibliographyNodes: Node[] = [bibliographyHeading, bibliographyList]

  ensureBibliographyInTableOfContents(tree)

  // Add bibliography nodes to excluded set to prevent URL harvesting from bibliography entries
  bibliographyNodes.forEach((node) => addSubtreeToSet(node, excludedNodes))

  bibliographyList.ordered = true
  bibliographyList.start = bibliographyList.start ?? 1

  const urlToExistingNumber = new Map<string, ExistingEntryInfo>()
  const numberToEntry = new Map<number, ExistingEntryInfo>()
  const allEntries: ExistingEntryInfo[] = []

    const existingItemsToProcess = existingBibliographyItems.length
      ? existingBibliographyItems.map((item) => cloneNode(item))
      : (bibliographyList.children as ListItem[])

    existingItemsToProcess.forEach((listItem, idx) => {
      if (!bibliographyList.children.includes(listItem)) {
        bibliographyList.children.push(listItem)
      }
    const number = (bibliographyList!.start ?? 1) + idx
    const anchorId = `bib-${number}`
    ensureListItemAnchor(listItem, anchorId)
    const normalised = extractUrlFromListItem(listItem)
    
    const entry: ExistingEntryInfo = {
      number,
      normalizedUrl: normalised,
      listItem,
      anchorId,
      sourceType: 'existing',
      metadata: undefined,
      firstOccurrence: Number.POSITIVE_INFINITY,
      originalIndex: idx,
      isNew: false,
    }
    if (normalised && !urlToExistingNumber.has(normalised)) {
      urlToExistingNumber.set(normalised, entry)
    }
    numberToEntry.set(number, entry)
    allEntries.push(entry)
    
    // Check if existing entry is incomplete (just a bare URL without proper citation info)
      if (normalised && !manualMetadataMap.has(normalised)) {
        const issue = buildIncompleteCitationIssue(listItem, normalised)
        if (issue) {
          pendingExistingMetadataIssues.push({
            issue,
            normalizedUrl: normalised,
          })
        }
      }
  })

  // Track existing citation links to update them later with correct numbers
  const existingCitationLinks: Array<{ 
    linkNode: Link; 
    oldNumber: number;
  }> = []
  
  visit(tree, 'link', (node: Link) => {
    if (node.url) {
      const match = node.url.match(/^#bib-(\d+)$/)
      if (match) {
        const oldNumber = parseInt(match[1], 10)
        existingCitationLinks.push({ linkNode: node, oldNumber })
      }
    }
  })

  const urlOccurrences = new Map<string, UrlOccurrence[]>()
  const urlFirstOccurrence = new Map<string, number>()
  let occurrenceCounter = 0
  const bareTextOccurrences: Array<{
    node: Text
    parent: Parent
    matches: Array<{ start: number; end: number; url: string }>
  }> = []

  const definitionMap = new Map<string, Definition>()
  visit(tree, 'definition', (node: Definition) => {
    if (!node.identifier || !node.url) {
      return
    }
    definitionMap.set(node.identifier.toLowerCase(), node)
  })

  visitParents(tree, ['link', 'linkReference', 'text'], (node, ancestors) => {
    if (node.type === 'link' || node.type === 'linkReference') {
      const shouldExclude = ancestors.some((ancestor) => excludedNodes.has(ancestor))
      if (
        shouldExclude &&
        ancestors.some((ancestor) => ancestor.type === 'linkReference')
      ) {
        // Links inside bibliographies should still be tracked for renumbering
      } else if (shouldExclude || ancestors.some((ancestor) => excludedAncestorTypes.has(ancestor.type))) {
        return
      }

      let url: string | undefined
      if (node.type === 'link') {
        url = node.url || ''
      } else if (node.type === 'linkReference') {
        if (!node.identifier) {
          return
        }
        const definition = definitionMap.get(node.identifier.toLowerCase())
        url = definition?.url
      }
      if (!url) {
        return
      }
      if (!/^https?:\/\//i.test(url)) {
        return
      }

      const normalised = normalizeUrl(url)
      const position = occurrenceCounter++
      if (!urlFirstOccurrence.has(normalised)) {
        urlFirstOccurrence.set(normalised, position)
      }
      const parent = ancestors[ancestors.length - 1] as Parent
      const index = parent.children.indexOf(node as Content)
      if (index === -1) {
        return
      }

      const occurrences = urlOccurrences.get(normalised) || []
      occurrences.push({
        type: 'link',
        node,
        parent,
        index,
      })
      urlOccurrences.set(normalised, occurrences)
    } else if (node.type === 'text') {
      if (
        ancestors.some((ancestor) => excludedNodes.has(ancestor)) ||
        ancestors.some((ancestor) => excludedAncestorTypes.has(ancestor.type))
      ) {
        return
      }
      const parent = ancestors[ancestors.length - 1] as Parent
      if (parent.type === 'link') {
        return
      }

      const matches: Array<{ start: number; end: number; url: string }> = []
      const text = node.value
      let match: RegExpExecArray | null
      MARKDOWN_URL_REGEX.lastIndex = 0
      while ((match = MARKDOWN_URL_REGEX.exec(text))) {
        const rawUrl = match[1]
        const cleanedUrl = stripTrailingPunctuationFromUrl(rawUrl)
        const removed = rawUrl.length - cleanedUrl.length
        matches.push({
          start: match.index,
          end: match.index + rawUrl.length - removed,
          url: cleanedUrl,
        })
      }

      if (matches.length) {
        bareTextOccurrences.push({
          node,
          parent,
          matches: matches.map((m) => ({ ...m })),
        })

        const perUrlMatches = new Map<string, Array<{ start: number; end: number }>>()
        matches.forEach((m) => {
          const normalised = normalizeUrl(m.url)
          const position = occurrenceCounter++
          if (!urlFirstOccurrence.has(normalised)) {
            urlFirstOccurrence.set(normalised, position)
          }
          const list = perUrlMatches.get(normalised) || []
          list.push({ start: m.start, end: m.end })
          perUrlMatches.set(normalised, list)
        })

        perUrlMatches.forEach((matchList, normalised) => {
          const list = urlOccurrences.get(normalised) || []
          list.push({
            type: 'bare',
            node,
            parent,
            index: parent.children.indexOf(node as Content),
            matches: matchList,
          })
          urlOccurrences.set(normalised, list)
        })
      }
    }
  })

  // Collect URLs from sections that should be excluded from bibliography FIRST
  // NOTE: These section names intentionally don't match actual headings
  // to preserve ~330 references in bibliography (sections contain legitimate content URLs)
  const sectionsToExclude = [
    'websites-and-online-communities',
    'petitionsfund-raisers',
    'court-cases'
  ]
  
  const urlsToExclude = new Set<string>()
  
  sectionsToExclude.forEach((sectionSlug) => {
    const sectionRange = findSectionRange(tree, sectionSlug)
    if (!sectionRange) {
      return
    }
    const sectionNodes = collectNodesInRange(tree, sectionRange)
    sectionNodes.forEach((node) => {
      visit(node, 'link', (linkNode: Link) => {
        if (linkNode.url && /^https?:\/\//i.test(linkNode.url)) {
          urlsToExclude.add(normalizeUrl(linkNode.url))
        }
      })
    })
  })
  
  const shouldExcludeUrlFromBibliography = (normalizedUrl?: string | null): boolean => {
    if (!normalizedUrl) {
      return false
    }
    
    if (urlsToExclude.has(normalizedUrl)) {
      return true
    }
    
    const lowerUrl = normalizedUrl.toLowerCase()
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('reddit.com')) {
      return true
    }
    
    const hasImageExtension = /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)($|\?|#)/i.test(lowerUrl)
    const isSubstackImage = lowerUrl.includes('substackcdn.com') && lowerUrl.includes('/image/fetch/')
    
    return hasImageExtension || isSubstackImage
  }
  
  pendingExistingMetadataIssues.forEach(({ issue, normalizedUrl }) => {
    if (!shouldExcludeUrlFromBibliography(normalizedUrl)) {
      metadataIssues.push(issue)
    }
  })

  const newUrls: string[] = []

  urlOccurrences.forEach((_occurrences, url) => {
    if (!urlToExistingNumber.has(url)) {
      newUrls.push(url)
    }
  })

    if (newUrls.length) {
      const metadataRecords: Array<{ metadata: SourceMetadata | null; normalizedUrl: string }> = []
  
      newUrls.forEach((normalizedUrl) => {
        const manualOverride = manualMetadataMap.get(normalizedUrl)
        if (manualOverride) {
          const manualMetadata: SourceMetadata = {
            url: manualOverride.url || normalizedUrl,
            title: manualOverride.title || manualOverride.url || normalizedUrl,
            authors: manualOverride.authors,
            siteName: manualOverride.siteName,
            isPdf: manualOverride.isPdf ?? false,
            accessDate: manualOverride.accessDate ?? format(new Date(), 'MMMM d, yyyy'),
            sourceType: 'manual',
          }
          metadataRecords.push({ metadata: manualMetadata, normalizedUrl })
        } else {
          metadataRecords.push({ metadata: null, normalizedUrl })
        }
      })
  
      for (let i = 0; i < metadataRecords.length; i += 1) {
        const record = metadataRecords[i]
        if (!record.metadata) {
          // Only add to metadataIssues if it won't be excluded from final bibliography
          if (!shouldExcludeUrlFromBibliography(record.normalizedUrl)) {
            // Automatic metadata fetching removed - users can provide metadata manually
            metadataIssues.push({
              url: record.normalizedUrl,
              message: 'Metadata not provided. You can add details manually or skip.',
            })
          }
          
          // Create a default metadata record using the URL
          const defaultMetadata: SourceMetadata = {
            url: record.normalizedUrl,
            title: record.normalizedUrl,
            authors: [],
            siteName: undefined,
            isPdf: false,
            accessDate: format(new Date(), 'MMMM d, yyyy'),
          }
          record.metadata = defaultMetadata
        }
      }

    const existingCount = allEntries.length
    metadataRecords.forEach(({ metadata, normalizedUrl }, idx) => {
      if (!metadata) {
        return
      }
      const listItem: ListItem = {
        type: 'listItem',
        spread: false,
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'html', value: '<a id=""></a>' } as Html,
              ...buildCitationContent(metadata),
            ],
          },
        ],
      }
      const entryInfo: ExistingEntryInfo = {
        number: 0,
        normalizedUrl,
        listItem,
        anchorId: '',
        sourceType: metadata.sourceType === 'manual' ? 'manual' : 'fetched',
        metadata,
        firstOccurrence: urlFirstOccurrence.get(normalizedUrl) ?? Number.POSITIVE_INFINITY,
        originalIndex: existingCount + idx,
        isNew: true,
      }
      allEntries.push(entryInfo)
    })
  }

  allEntries.forEach((entry) => {
    if (entry.normalizedUrl) {
      const occurrence = urlFirstOccurrence.get(entry.normalizedUrl)
      if (occurrence !== undefined) {
        entry.firstOccurrence = occurrence
      }
    }
  })

  // Filter out excluded entries (exclusion collection logic moved earlier)
    const filteredEntries = allEntries.filter((entry) => {
      if (!entry.normalizedUrl) {
        return true // Keep entries without URLs
      }
      
      return !shouldExcludeUrlFromBibliography(entry.normalizedUrl)
    })

  filteredEntries.sort((a, b) => {
    if (a.firstOccurrence !== b.firstOccurrence) {
      return a.firstOccurrence - b.firstOccurrence
    }
    return a.originalIndex - b.originalIndex
  })

  bibliographyList.children = []
  bibliographyList.start = 1
  urlToExistingNumber.clear()
  numberToEntry.clear()

  // Build mapping from old numbers to new numbers and URLs
  const oldNumberToNewEntry = new Map<number, ExistingEntryInfo>()
  allEntries.forEach((entry) => {
    const oldNumber = entry.number
    const filteredEntry = filteredEntries.find(fe => fe.normalizedUrl === entry.normalizedUrl)
    if (filteredEntry) {
      oldNumberToNewEntry.set(oldNumber, filteredEntry)
    }
  })

  filteredEntries.forEach((entry, idx) => {
    const number = (bibliographyList.start ?? 1) + idx
    entry.number = number
    entry.anchorId = `bib-${number}`
    ensureListItemAnchor(entry.listItem, entry.anchorId)
    bibliographyList.children.push(entry.listItem)
    if (entry.normalizedUrl) {
      urlToExistingNumber.set(entry.normalizedUrl, entry)
    }
    numberToEntry.set(number, entry)
  })

  // Update or remove existing citation links based on filtering
  const citationLinksToRemove: Link[] = []
  existingCitationLinks.forEach(({ linkNode, oldNumber }) => {
    const newEntry = oldNumberToNewEntry.get(oldNumber)
    if (newEntry) {
      // Update the link with the new number and anchor
      linkNode.url = `#${newEntry.anchorId}`
      if (linkNode.children && linkNode.children.length > 0 && linkNode.children[0].type === 'text') {
        (linkNode.children[0] as Text).value = `[${newEntry.number}]`
      }
    } else {
      // This entry was filtered out, mark link for removal
      citationLinksToRemove.push(linkNode)
    }
  })

  // Remove citation links that point to filtered-out entries
  citationLinksToRemove.forEach((linkToRemove) => {
    visit(tree, (node, index, parent) => {
      if (node === linkToRemove && parent && typeof index === 'number') {
        (parent as Parent).children.splice(index, 1)
        return [SKIP]
      }
    })
  })

  // Group occurrences by parent and find sentence boundaries
  // We need to process each parent separately and group references by sentence
  const parentToOccurrences = new Map<Parent, Array<{ linkIndex: number; entry: ExistingEntryInfo }>>()
  
  urlOccurrences.forEach((occurrences, url) => {
    const entry = urlToExistingNumber.get(url)
    if (!entry) {
      return
    }
    occurrences.forEach((occurrence) => {
      if (occurrence.type === 'link') {
        const list = parentToOccurrences.get(occurrence.parent) || []
        list.push({ linkIndex: occurrence.index, entry })
        parentToOccurrences.set(occurrence.parent, list)
      }
    })
  })
  
  // Process each parent's occurrences
  parentToOccurrences.forEach((occurrences, parent) => {
    // Sort by link index
    occurrences.sort((a, b) => a.linkIndex - b.linkIndex)
    
    // Find all sentence boundaries in this paragraph
    const sentenceBoundaries: Array<{ index: number; punctuationPos: number }> = []
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i]
      if (node.type === 'text') {
        const text = (node as Text).value
        // Match period, exclamation, question mark, colon, semicolon
        const match = text.match(/[.!?:;]/)
        if (match && match.index !== undefined) {
          sentenceBoundaries.push({ index: i, punctuationPos: match.index })
        }
      }
    }
    
    // If no boundaries found, use end of paragraph
    if (sentenceBoundaries.length === 0) {
      sentenceBoundaries.push({ index: parent.children.length - 1, punctuationPos: -1 })
    }
    
    // Group links by their nearest sentence boundary (looking forward)
    const sentenceGroups = new Map<number, Array<{ linkIndex: number; number: number; anchorId: string }>>()
    occurrences.forEach(({ linkIndex, entry }) => {
      // Find the first sentence boundary that comes after this link
      const boundary = sentenceBoundaries.find(b => b.index > linkIndex)
      const sentenceEndIndex = boundary ? boundary.index : sentenceBoundaries[sentenceBoundaries.length - 1].index
      
      const group = sentenceGroups.get(sentenceEndIndex) || []
      group.push({ linkIndex, number: entry.number, anchorId: entry.anchorId })
      sentenceGroups.set(sentenceEndIndex, group)
    })
    
    // Insert references at sentence ends, processing from end to start to maintain indices
    const positions = Array.from(sentenceGroups.entries()).sort((a, b) => b[0] - a[0])
    positions.forEach(([sentenceEndIndex, references]) => {
      // Deduplicate references by number (same URL might be linked multiple times)
      const uniqueRefs = Array.from(
        new Map(references.map(ref => [ref.number, ref])).values()
      )
      
      // Sort references by number for consistent ordering
      uniqueRefs.sort((a, b) => a.number - b.number)
      
      // Create reference nodes
      const refNodes = uniqueRefs.map(({ number, anchorId }) => 
        createReferenceNode(number, anchorId)
      )
      
      // Find the boundary info for this sentence end
      const boundaryInfo = sentenceBoundaries.find(b => b.index === sentenceEndIndex)
      
      if (boundaryInfo && boundaryInfo.punctuationPos >= 0) {
        // Split the text node at the punctuation mark
        const textNode = parent.children[sentenceEndIndex] as Text
        const beforePunct = textNode.value.substring(0, boundaryInfo.punctuationPos)
        const punctAndAfter = textNode.value.substring(boundaryInfo.punctuationPos)
        
        // Replace the text node with: text before punct + references + punct and after
        const newNodes: Content[] = []
        if (beforePunct) {
          newNodes.push({ type: 'text', value: beforePunct } as Text)
        }
        newNodes.push(...refNodes)
        newNodes.push({ type: 'text', value: punctAndAfter } as Text)
        
        parent.children.splice(sentenceEndIndex, 1, ...newNodes)
      } else {
        // No punctuation found, just append at the end
        parent.children.splice(sentenceEndIndex + 1, 0, ...refNodes)
      }
    })
  })

  bareTextOccurrences.forEach(({ node, parent, matches }) => {
    const value = node.value
    let cursor = 0
    const newNodes: Content[] = []
    const sorted = [...matches].sort((a, b) => a.start - b.start)

    sorted.forEach((match) => {
      const entry = urlToExistingNumber.get(normalizeUrl(match.url))
      if (!entry) {
        return
      }

      if (match.start > cursor) {
        const textSegment = value.slice(cursor, match.start)
        if (textSegment) {
          newNodes.push({
            type: 'text',
            value: textSegment,
          } as Text)
        }
      }

      // For bare URLs, we remove the URL and add the reference
      newNodes.push(createReferenceNode(entry.number, entry.anchorId))
      cursor = match.end
    })

    if (cursor < value.length) {
      newNodes.push({
        type: 'text',
        value: value.slice(cursor),
      } as Text)
    }

    if (!newNodes.length) {
      return
    }

    const index = parent.children.indexOf(node as Content)
    if (index !== -1) {
      parent.children.splice(index, 1, ...newNodes)
    }
  })

  const { title, subtitle, headings } = extractHeadings(tree)

  tree.children = tree.children.filter((node) => node.type !== 'yaml')

  const removedTitleHeading = removeInitialHeadingMatchingTitle(tree, title)

  let sanitizedHeadings = headings
  if (removedTitleHeading && title) {
    const normalizedTitle = title.trim().toLowerCase()
    sanitizedHeadings = headings.filter(
      (heading, index) =>
        !(
          heading.depth === 1 &&
          heading.text.trim().toLowerCase() === normalizedTitle &&
          index === 0
        ),
    )
  }

  const stringified = unified()
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      listItemIndent: 'one',
    })
    .use(remarkFrontmatter)
    .stringify(tree)

  const bibliographyEntries: BibliographyEntry[] = bibliographyList.children.map((listItem, idx) => {
    const number = (bibliographyList.start ?? 1) + idx
    const anchorId = `bib-${number}`
    ensureListItemAnchor(listItem, anchorId)
    const textValue = toString(listItem).trim()
    const entryInfo = numberToEntry.get(number)
    const resolvedUrl =
      entryInfo?.metadata?.url ||
      entryInfo?.normalizedUrl ||
      ''
    return {
      number,
      url: resolvedUrl,
      citation: textValue,
      anchorId,
      isNew: entryInfo?.isNew ?? false,
      sourceType: entryInfo?.sourceType ?? 'existing',
    }
  })

  return {
    original: markdown,
    modified: stringified,
    title,
    subtitle,
    mainHeadingDepth,
    headings: sanitizedHeadings,
    bibliographyEntries,
    diagnostics,
    metadataIssues,
  }
}
