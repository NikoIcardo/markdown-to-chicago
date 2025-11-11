import { format } from 'date-fns'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { visitParents } from 'unist-util-visit-parents'
import { toString } from 'mdast-util-to-string'
import type { Content, Heading, Html, Link, List, ListItem, Parent, Paragraph, Root, Text } from 'mdast'
import type { Node } from 'unist'
import { fetchSourceMetadata } from './metadataFetcher'
import type {
  BibliographyEntry,
  ManualMetadataInput,
  MetadataIssue,
  ProcessedMarkdown,
  ProcessingDiagnostics,
  SourceMetadata,
} from './types'

const MARKDOWN_URL_REGEX = /(https?:\/\/[^\s<>\]\)"}]+)/gi

const processor = unified().use(remarkParse).use(remarkGfm)

type SectionRange = {
  startIndex: number
  endIndex: number
  depth: number
}

type UrlOccurrence =
  | {
      type: 'link'
      node: Link
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
  url?: string
  listItem: ListItem
  anchorId: string
  sourceType: 'existing' | 'fetched' | 'manual'
  metadata?: SourceMetadata
}

const excludedAncestorTypes = new Set(['code', 'inlineCode', 'definition'])

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim())
    parsed.hash = ''
    const normalised = parsed.toString()
    return normalised.endsWith('/') ? normalised.slice(0, -1) : normalised
  } catch {
    return url.trim()
  }
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

  const hasAnchor = firstParagraph.children.some(
    (child) => child.type === 'html' && (child as Html).value.includes(anchorId),
  )

  if (!hasAnchor) {
    firstParagraph.children.unshift({
      type: 'html',
      value: `<a id="${anchorId}"></a>`,
    } as Html)
  }
}

function formatAuthors(authors: string[]): string {
  if (!authors.length) return ''
  if (authors.length === 1) return `${authors[0]}.`
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}.`

  const [first, ...rest] = authors
  const last = rest.pop()
  return `${first}, ${rest.join(', ')}, and ${last}.`
}

function formatCitation(metadata: SourceMetadata): string {
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
  parts.push(metadata.url.endsWith('.') ? metadata.url : `${metadata.url}.`)

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function createSuperscriptNode(number: number, anchorId: string): Html {
  return {
    type: 'html',
    value: `<sup><a href="#${anchorId}">[${number}]</a></sup>`,
  }
}

function extractHeadings(root: Root): { title: string; headings: ProcessedMarkdown['headings'] } {
  const headings: ProcessedMarkdown['headings'] = []
  let title = ''

  visit(root, 'heading', (node: Heading) => {
    const text = toString(node).trim()
    if (!title) {
      title = text
    }
    headings.push({
      depth: node.depth,
      text,
      slug: slugify(text),
    })
  })

  return { title, headings }
}

interface ProcessMarkdownOptions {
  manualMetadata?: Record<string, ManualMetadataInput>
}

export async function processMarkdown(
  markdown: string,
  options: ProcessMarkdownOptions = {},
): Promise<ProcessedMarkdown> {
  const tree = processor.parse(markdown) as Root
  const diagnostics: ProcessingDiagnostics = { warnings: [], errors: [] }
  const metadataIssues: MetadataIssue[] = []

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

  let bibliographyRange = findSectionRange(tree, 'bibliography')
  const rootChildren = tree.children

  let bibliographyHeading: Heading

  if (bibliographyRange) {
    bibliographyHeading = rootChildren[bibliographyRange.startIndex] as Heading
    bibliographyHeading.depth = normalizedHeadingDepth
  } else {
    bibliographyHeading = {
      type: 'heading',
      depth: normalizedHeadingDepth,
      children: [{ type: 'text', value: 'Bibliography' }],
    }
    rootChildren.push(bibliographyHeading)
    const listNode: List = {
      type: 'list',
      ordered: true,
      spread: false,
      start: 1,
      children: [],
    }
    rootChildren.push(listNode)
    bibliographyRange = {
      startIndex: rootChildren.length - 2,
      endIndex: rootChildren.length,
      depth: bibliographyHeading.depth,
    }
  }

  const bibliographyNodes = collectNodesInRange(tree, bibliographyRange!)
  let bibliographyList = bibliographyNodes.find(
    (node): node is List => node.type === 'list',
  )

  if (!bibliographyList) {
    bibliographyList = {
      type: 'list',
      ordered: true,
      spread: false,
      start: 1,
      children: [],
    }
    rootChildren.splice(bibliographyRange!.endIndex, 0, bibliographyList)
  }

  bibliographyList.ordered = true
  bibliographyList.start = bibliographyList.start ?? 1

  const urlToExistingNumber = new Map<string, ExistingEntryInfo>()
  const numberToEntry = new Map<number, ExistingEntryInfo>()

  bibliographyList.children.forEach((listItem, idx) => {
    const number = (bibliographyList!.start ?? 1) + idx
    const anchorId = `bib-${number}`
    ensureListItemAnchor(listItem, anchorId)
    const textValue = toString(listItem)
    const urlMatch = textValue.match(/https?:\/\/[^\s)]+/i)
    const normalised = urlMatch ? normalizeUrl(urlMatch[0]) : undefined
    const entry: ExistingEntryInfo = {
      number,
      url: normalised,
      listItem,
      anchorId,
      sourceType: 'existing',
    }
    if (normalised && !urlToExistingNumber.has(normalised)) {
      urlToExistingNumber.set(normalised, entry)
    }
    numberToEntry.set(number, entry)
  })

  const urlOccurrences = new Map<string, UrlOccurrence[]>()
  const bareTextOccurrences: Array<{
    node: Text
    parent: Parent
    matches: Array<{ start: number; end: number; url: string }>
  }> = []

  visitParents(tree, ['link', 'text'], (node, ancestors) => {
    if (
      ancestors.some((ancestor) => excludedNodes.has(ancestor)) ||
      ancestors.some((ancestor) => excludedAncestorTypes.has(ancestor.type))
    ) {
      return
    }

    if (node.type === 'link') {
      const url = node.url || ''
      if (!/^https?:\/\//i.test(url)) {
        return
      }

      const normalised = normalizeUrl(url)
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
      const parent = ancestors[ancestors.length - 1] as Parent
      if (parent.type === 'link') {
        return
      }

        const matches: Array<{ start: number; end: number; url: string }> = []
        const text = node.value
        let match: RegExpExecArray | null
        MARKDOWN_URL_REGEX.lastIndex = 0
        while ((match = MARKDOWN_URL_REGEX.exec(text))) {
          const url = match[1]
          matches.push({
            start: match.index,
            end: match.index + url.length,
            url,
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

  const newUrls: string[] = []

  urlOccurrences.forEach((_occurrences, url) => {
    if (!urlToExistingNumber.has(url)) {
      newUrls.push(url)
    }
  })

  const newEntryAnchors = new Set<string>()

  if (newUrls.length) {
    const metadataRecords: Array<{ metadata: SourceMetadata; normalizedUrl: string }> = []

    for (const normalizedUrl of newUrls) {
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
        continue
      }

      const fetchedMetadata = await fetchSourceMetadata(normalizedUrl)
      fetchedMetadata.sourceType = 'fetched'

      if (fetchedMetadata.retrievalError) {
        const issueMessage = fetchedMetadata.retrievalError
        metadataIssues.push({
          url: fetchedMetadata.url,
          message: issueMessage,
        })
        diagnostics.warnings.push(
          `Could not fully retrieve metadata for ${normalizedUrl}: ${issueMessage}`,
        )
      }

      metadataRecords.push({ metadata: fetchedMetadata, normalizedUrl })
    }

    let nextNumber =
      (bibliographyList.start ?? 1) + bibliographyList.children.length

    metadataRecords.forEach(({ metadata, normalizedUrl }) => {
      nextNumber += 1
      const number = nextNumber
      const anchorId = `bib-${number}`
      const citation = formatCitation(metadata)
      const listItem: ListItem = {
        type: 'listItem',
        spread: false,
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'html', value: `<a id="${anchorId}"></a>` } as Html,
              { type: 'text', value: citation } as Text,
            ],
          },
        ],
      }
      bibliographyList.children.push(listItem)
      const entryInfo: ExistingEntryInfo = {
        number,
        url: normalizedUrl,
        listItem,
        anchorId,
        sourceType: metadata.sourceType === 'manual' ? 'manual' : 'fetched',
        metadata,
      }
      newEntryAnchors.add(anchorId)
      urlToExistingNumber.set(normalizedUrl, entryInfo)
      numberToEntry.set(number, entryInfo)
    })
  }

  urlOccurrences.forEach((occurrences, url) => {
    const entry = urlToExistingNumber.get(url)
    if (!entry) {
      return
    }
    occurrences.forEach((occurrence) => {
      if (occurrence.type === 'link') {
        const supNode = createSuperscriptNode(entry.number, entry.anchorId)
        occurrence.parent.children.splice(occurrence.index + 1, 0, supNode)
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

      newNodes.push(createSuperscriptNode(entry.number, entry.anchorId))
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

  const stringified = unified()
    .use(remarkStringify, {
      bullet: '-',
      fences: true,
      listItemIndent: 'one',
    })
    .stringify(tree)

  const { title, headings } = extractHeadings(tree)

  const bibliographyEntries: BibliographyEntry[] = bibliographyList.children.map((listItem, idx) => {
    const number = (bibliographyList.start ?? 1) + idx
    const anchorId = `bib-${number}`
    ensureListItemAnchor(listItem, anchorId)
    const textValue = toString(listItem).trim()
    const urlMatch = textValue.match(/https?:\/\/[^\s)]+/i)
    const entryInfo = numberToEntry.get(number)
    const resolvedUrl =
      entryInfo?.metadata?.url ||
      urlMatch?.[0] ||
      entryInfo?.url ||
      ''
    return {
      number,
      url: resolvedUrl,
      citation: textValue,
      anchorId,
      isNew: newEntryAnchors.has(anchorId),
      sourceType: entryInfo?.sourceType ?? 'existing',
    }
  })

  return {
    original: markdown,
    modified: stringified,
    title,
    mainHeadingDepth,
    headings,
    bibliographyEntries,
    diagnostics,
    metadataIssues,
  }
}
