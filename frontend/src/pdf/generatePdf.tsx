import { pdf, Document, Page, Text, View, StyleSheet, Link, Image } from '@react-pdf/renderer'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'
import type {
  Content,
  Heading,
  Html,
  Image as MdImage,
  InlineCode,
  Link as MdLink,
  List,
  ListItem,
  Paragraph,
  Parent,
  Root,
  Strong,
  Text as MdText,
} from 'mdast'
import type { ProcessedMarkdown } from '../utils/types'

type InlineNode =
  | MdText
  | Strong
  | MdLink
  | InlineCode
  | Html
  | Content

const styles = StyleSheet.create({
  page: {
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 64,
    fontFamily: 'Times-Roman',
    fontSize: 12,
    lineHeight: 1.5,
  },
  pageNumber: {
    position: 'absolute',
    top: 24,
    right: 32,
    fontSize: 11,
    color: '#333333',
  },
  titlePage: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    height: '100%',
    paddingTop: 216,
  },
  titleText: {
    fontSize: 24,
    fontWeight: 600,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  subtitleText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  tocHeader: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 24,
  },
  tocEntry: {
    fontSize: 12,
    marginBottom: 8,
  },
  tocEntryIndent: {
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 30,
  },
  tocEntryDeepIndent: {
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 50,
  },
  tocBullet: {
    marginRight: 8,
  },
  contentWrapper: {
    width: '100%',
  },
  heading1: {
    fontSize: 24,
    fontWeight: 600,
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 1.3,
  },
  heading2: {
    fontSize: 20,
    fontWeight: 600,
    marginTop: 14,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  heading3: {
    fontSize: 18,
    fontWeight: 600,
    marginTop: 12,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  heading4: {
    fontSize: 16,
    fontWeight: 600,
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  heading5: {
    fontSize: 14,
    fontWeight: 600,
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  heading6: {
    fontSize: 13,
    fontWeight: 600,
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  paragraphContainer: {
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 12,
  },
  strong: {
    fontWeight: 600,
  },
  emphasis: {
    fontStyle: 'italic',
  },
  link: {
    color: '#1a56db',
    textDecoration: 'underline',
  },
  superscript: {
    fontSize: 10,
    baselineShift: 6,
    color: '#1a56db',
  },
  orderedList: {
    marginBottom: 8,
  },
  unorderedList: {
    marginBottom: 8,
  },
  nestedList: {
    marginLeft: 20,
    marginTop: 4,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  listMarker: {
    width: 16,
    fontSize: 12,
  },
  listContent: {
    flex: 1,
  },
  blockquote: {
    borderLeftWidth: 2,
    borderLeftColor: '#cccccc',
    paddingLeft: 12,
    marginVertical: 8,
    color: '#555555',
    fontStyle: 'italic',
  },
  codeBlock: {
    fontFamily: 'Courier',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  inlineCode: {
    fontFamily: 'Courier',
    backgroundColor: '#f1f1f1',
    padding: 2,
  },
  anchorMarker: {
    fontSize: 1,
    color: 'transparent',
    lineHeight: 1,
    marginBottom: 0,
  },
  imageContainer: {
    marginVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    maxWidth: '100%',
    maxHeight: 320,
    objectFit: 'contain',
    marginBottom: 4,
  },
  imageWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  imageReferenceContainer: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
  },
  imageReferenceText: {
    fontSize: 10,
    color: '#1a56db',
    textDecoration: 'underline',
  },
  imageReferenceItem: {
    marginLeft: 4,
  },
  imageCaption: {
    fontSize: 10,
    color: '#4b5563',
    fontStyle: 'italic',
    textAlign: 'center',
  },
})

const headingStyles: Record<number, any> = {
  1: styles.heading1,
  2: styles.heading2,
  3: styles.heading3,
  4: styles.heading4,
  5: styles.heading5,
  6: styles.heading6,
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function extractAnchor(children: Content[]): {
  anchorId?: string
  remainder: Content[]
} {
  let anchorId: string | undefined
  const remainder: Content[] = []

  children.forEach((child) => {
    if (child.type === 'html') {
      const match = (child as Html).value.match(/<a id="([^"]+)"><\/a>/i)
      if (match) {
        anchorId = match[1]
        return
      }
    }
    remainder.push(child)
  })

  return { anchorId, remainder }
}

function renderSuperscript(html: Html, key: string) {
  const match = html.value.match(/<sup>\s*<a href="#([^"]+)">([^<]+)<\/a>\s*<\/sup>/i)
  if (!match) {
    return null
  }
  const [, target, label] = match
  return (
    <Text key={key} style={styles.superscript}>
      <Link src={`#${target}`} style={styles.link}>
        {label}
      </Link>
    </Text>
  )
}

function renderInline(node: InlineNode, key: string): React.ReactNode {
  switch (node.type) {
    case 'text':
      return (node as MdText).value
    case 'strong':
      return (
        <Text key={key} style={styles.strong}>
          {renderInlineChildren((node as Strong).children as InlineNode[], key)}
        </Text>
      )
    case 'emphasis':
      return (
        <Text key={key} style={styles.emphasis}>
          {renderInlineChildren((node as Parent).children as InlineNode[], key)}
        </Text>
      )
    case 'link': {
      const linkNode = node as MdLink
      const href = linkNode.url
      
      // Check if this is a bibliography reference link
      if (href.startsWith('#bib-')) {
        // Render as superscript reference
        return (
          <Text key={key} style={styles.superscript}>
            <Link src={href} style={styles.link}>
              {renderInlineChildren(linkNode.children as InlineNode[], key)}
            </Link>
          </Text>
        )
      }
      
      return (
        <Link key={key} src={href} style={styles.link}>
          {renderInlineChildren(linkNode.children as InlineNode[], key)}
        </Link>
      )
    }
    case 'inlineCode':
      return (
        <Text key={key} style={styles.inlineCode}>
          {(node as InlineCode).value}
        </Text>
      )
    case 'html': {
      const htmlNode = node as Html
      const superscript = renderSuperscript(htmlNode, key)
      if (superscript) {
        return superscript
      }
      return null
    }
    default:
      if ('children' in node && Array.isArray((node as Parent).children)) {
        return renderInlineChildren((node as Parent).children as InlineNode[], key)
      }
      return null
  }
}

function renderInlineChildren(children: InlineNode[], keyPrefix: string): React.ReactNode[] {
  return children.map((child, index) => renderInline(child, `${keyPrefix}-${index}`)).filter(Boolean)
}

function isBibliographyReferenceLink(node: Content): node is MdLink {
  return node.type === 'link' && (node as MdLink).url.startsWith('#bib-')
}

function isImageLinkNode(node: Content): node is MdLink {
  return (
    node.type === 'link' &&
    (node as MdLink).children.some((child) => child.type === 'image')
  )
}

function renderImageBlock({
  imageNode,
  key,
  anchorId,
  linkHref,
  references,
  imageMap,
}: {
  imageNode: MdImage
  key: string
  anchorId?: string
  linkHref?: string
  references: MdLink[]
  imageMap: Record<string, string>
}) {
  if (!imageNode.url) {
    return null
  }

  const anchorElement = anchorId ? (
    <Text key={`${key}-anchor`} id={anchorId} style={styles.anchorMarker}>
      {' '}
    </Text>
  ) : null

  const resolvedSrc = imageMap[imageNode.url] ?? imageNode.url

  const imageElement = linkHref ? (
    <Link src={linkHref}>
      <Image src={resolvedSrc} style={styles.image} />
    </Link>
  ) : (
    <Image src={resolvedSrc} style={styles.image} />
  )

  return (
    <View key={key} style={styles.imageContainer}>
      {anchorElement}
      <View style={styles.imageWrapper}>
        {imageElement}
        {references.length ? (
          <View style={styles.imageReferenceContainer}>
            {references.map((reference, index) => {
              const linkStyle =
                index === 0
                  ? styles.imageReferenceText
                  : [styles.imageReferenceText, styles.imageReferenceItem]
              return (
                <Link
                  key={`${key}-ref-${index}`}
                  src={reference.url}
                  style={linkStyle}
                >
                  {renderInlineChildren(reference.children as InlineNode[], `${key}-ref-${index}`)}
                </Link>
              )
            })}
          </View>
        ) : null}
      </View>
      {imageNode.alt ? <Text style={styles.imageCaption}>{imageNode.alt}</Text> : null}
    </View>
  )
}

function renderParagraph(node: Paragraph, key: string, imageMap: Record<string, string>) {
  const { anchorId, remainder } = extractAnchor(node.children as Content[])
  if (!remainder.length) {
    if (anchorId) {
      return (
        <Text key={key} id={anchorId} style={styles.anchorMarker}>
          {' '}
        </Text>
      )
    }
    return null
  }

  const cleanedChildren = (remainder as Content[]).filter((child) => {
    if (child.type === 'text') {
      return Boolean((child as MdText).value.trim())
    }
    return true
  })

  let imageNode: MdImage | undefined
  let linkHref: string | undefined

  const imageLink = cleanedChildren.find(isImageLinkNode)
  if (imageLink) {
    imageNode = imageLink.children.find((child) => child.type === 'image') as MdImage | undefined
    linkHref = imageLink.url
  } else {
    imageNode = cleanedChildren.find((child): child is MdImage => child.type === 'image')
  }

  const references = cleanedChildren.filter(isBibliographyReferenceLink)

  const significantChildren = cleanedChildren.filter((child) => {
    if (isBibliographyReferenceLink(child)) {
      return false
    }
    if (child.type === 'text') {
      return Boolean((child as MdText).value.trim())
    }
    return true
  })

  const imageOnlyContent =
    imageNode &&
    significantChildren.every(
      (child) => child.type === 'image' || isImageLinkNode(child),
    )

  if (imageNode && imageOnlyContent) {
    return renderImageBlock({
      imageNode,
      key,
      anchorId,
      linkHref,
      references,
      imageMap,
    })
  }

  const paragraphText = (
    <Text key={`${key}-text`} style={styles.paragraph}>
      {renderInlineChildren(remainder as InlineNode[], key)}
    </Text>
  )

  if (anchorId) {
    return (
      <View key={key} style={styles.paragraphContainer}>
        <Text id={anchorId} style={styles.anchorMarker}>
          {' '}
        </Text>
        {paragraphText}
      </View>
    )
  }

  return (
    <View key={key} style={styles.paragraphContainer}>
      {paragraphText}
    </View>
  )
}

function renderListItem(
  node: ListItem,
  key: string,
  options: { ordered: boolean; index: number; start: number; depth: number },
  render: (node: Content, key: string, depth?: number, insideList?: boolean) => React.ReactNode,
) {
  const marker = options.ordered ? `${options.start + options.index}.` : '•'

  return (
    <View key={key} style={styles.listItem}>
      <Text style={styles.listMarker}>{marker}</Text>
      <View style={styles.listContent}>
        {node.children.map((child, idx) =>
          render(child as Content, `${key}-${idx}`, options.depth + 1, true),
        )}
      </View>
    </View>
  )
}

function renderList(
  node: List,
  key: string,
  render: (node: Content, key: string, depth?: number, insideList?: boolean) => React.ReactNode,
  depth: number = 0,
) {
  const isOrdered = Boolean(node.ordered)
  const start = node.start ?? 1
  const baseStyle = isOrdered ? styles.orderedList : styles.unorderedList
  const listStyle = depth > 0 ? [baseStyle, styles.nestedList] : baseStyle
  
  return (
    <View
      key={key}
      style={listStyle}
    >
      {node.children.map((child, idx) =>
        renderListItem(
          child as ListItem,
          `${key}-${idx}`,
          {
            ordered: isOrdered,
            index: idx,
            start,
            depth,
          },
          render,
        ),
      )}
    </View>
  )
}

function renderNodeFactory(
  headings: ProcessedMarkdown['headings'],
  imageMap: Record<string, string>,
) {
  let headingIndex = 0

  const render = (
    node: Content,
    key: string,
    depth: number = 0,
    insideList: boolean = false,
  ): React.ReactNode => {
    switch (node.type) {
      case 'paragraph':
        return renderParagraph(node as Paragraph, key, imageMap)
      case 'heading': {
        const headingNode = node as Heading
        const textContent = headingNode.children
          .map((child) => ('value' in child ? (child as any).value : ''))
          .join('')
        const headingInfo = headings[headingIndex]
        const slug = headingInfo ? headingInfo.slug : slugify(textContent)
        headingIndex += 1
        return (
          <Text key={key} id={slug} style={headingStyles[headingNode.depth] || styles.heading6}>
            {renderInlineChildren(headingNode.children as InlineNode[], key)}
          </Text>
        )
      }
      case 'image': {
        const imageNode = node as MdImage
        if (!imageNode.url) {
          return null
        }
        return renderImageBlock({ imageNode, key, references: [], imageMap })
      }
      case 'list':
        return renderList(node as List, key, render, depth)
      case 'blockquote':
        return (
          <View key={key} style={styles.blockquote}>
            {((node as Parent).children as Content[]).map((child, idx) =>
              render(child as Content, `${key}-${idx}`, depth, insideList),
            )}
          </View>
        )
      case 'code':
        // Skip code blocks that appear inside list items (they're likely improperly parsed nested lists)
        if (insideList) {
          return null
        }
        return (
          <View key={key} style={styles.codeBlock}>
            <Text>{(node as any).value}</Text>
          </View>
        )
      case 'html': {
        const htmlNode = node as Html
        const anchorMatch = htmlNode.value.match(/<a id="([^"]+)"><\/a>/i)
        if (anchorMatch) {
          return (
            <Text key={key} id={anchorMatch[1]} style={styles.anchorMarker}>
              {' '}
            </Text>
          )
        }
        const superscript = renderSuperscript(htmlNode, key)
        return superscript
      }
      default:
        if ('children' in node && Array.isArray((node as Parent).children)) {
          return (
            <View key={key}>
              {(node as Parent).children.map((child, idx) =>
                render(child as Content, `${key}-${idx}`, depth, insideList),
              )}
            </View>
          )
        }
        return null
    }
  }

  return render
}

const markdownParser = unified().use(remarkParse).use(remarkGfm)

function removeInitialTitleHeading(ast: Root, title?: string | null) {
  if (!title) {
    return
  }
  const normalizedTitle = title.trim().toLowerCase()
  if (!normalizedTitle) {
    return
  }

  let removed = false
  ast.children = ast.children.filter((node) => {
    if (
      !removed &&
      node.type === 'heading' &&
      (node as Heading).depth === 1 &&
      toString(node as Heading).trim().toLowerCase() === normalizedTitle
    ) {
      removed = true
      return false
    }
    return true
  })
}

function collectImageUrls(tree: Root): string[] {
  const urls = new Set<string>()
  visit(tree, 'image', (node: MdImage) => {
    if (node.url) {
      urls.add(node.url)
    }
  })
  return Array.from(urls)
}

async function preloadImages(urls: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          return
        }
        const contentType = response.headers.get('content-type') || 'application/octet-stream'
        const arrayBuffer = await response.arrayBuffer()
        const base64 = arrayBufferToBase64(arrayBuffer)
        map[url] = `data:${contentType};base64,${base64}`
      } catch (error) {
        console.warn(`Failed to preload image ${url}:`, error)
      }
    }),
  )
  return map
}

function arrayBufferToBase64(arrayBuffer: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(arrayBuffer).toString('base64')
  }
  let binary = ''
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  if (typeof btoa !== 'undefined') {
    return btoa(binary)
  }
  throw new Error('No available method to convert ArrayBuffer to base64')
}

function buildContentElements(
  tree: Root,
  headings: ProcessedMarkdown['headings'],
  imageMap: Record<string, string>,
) {
  const render = renderNodeFactory(headings, imageMap)
  return tree.children
    .map((node, index) => render(node as Content, `node-${index}`))
    .filter(Boolean)
}

const PageNumber: React.FC = () => (
  <Text
    style={styles.pageNumber}
    render={({ pageNumber }) => (pageNumber > 1 ? `${pageNumber - 1}` : '')}
    fixed
  />
)

export async function generatePdf(
  processed: ProcessedMarkdown,
  options?: { originalFileName?: string },
): Promise<Blob> {
  const ast = markdownParser.parse(processed.modified) as Root
  
  // Remove YAML frontmatter from AST before building content
  ast.children = ast.children.filter((node) => node.type !== 'yaml')
  removeInitialTitleHeading(ast, processed.title)

  const imageUrls = collectImageUrls(ast)
  const imageMap = await preloadImages(imageUrls)
  const contentElements = buildContentElements(ast, processed.headings, imageMap)
  const title = processed.title || options?.originalFileName || 'Untitled Document'
  const subtitle = processed.subtitle

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <PageNumber />
        <View style={styles.titlePage}>
          <Text style={styles.titleText}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitleText}>{subtitle}</Text>
          ) : null}
        </View>
      </Page>
      <Page size="A4" style={styles.page} wrap>
        <PageNumber />
        <View style={styles.contentWrapper}>{contentElements}</View>
      </Page>
    </Document>
  )

  const instance = pdf(doc)
  const blob = await instance.toBlob()
  return blob
}
