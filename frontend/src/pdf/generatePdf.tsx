import { pdf, Document, Page, Text, View, StyleSheet, Link, Image } from '@react-pdf/renderer'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { toString } from 'mdast-util-to-string'
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
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
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
    height: 0.1,
  },
  imageContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  image: {
    maxWidth: '100%',
    maxHeight: 320,
    objectFit: 'contain',
    marginBottom: 4,
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

function renderParagraph(node: Paragraph, key: string) {
  const { anchorId, remainder } = extractAnchor(node.children as Content[])
  if (!remainder.length) {
    if (anchorId) {
      return <View key={key} id={anchorId} style={styles.anchorMarker} />
    }
    return null
  }

  const paragraphText = (
    <Text key={`${key}-text`} style={styles.paragraph}>
      {renderInlineChildren(remainder as InlineNode[], key)}
    </Text>
  )

  if (anchorId) {
    return (
      <View key={key} id={anchorId} style={styles.paragraphContainer}>
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
  options: { ordered: boolean; index: number; start: number },
  render: (node: Content, key: string) => React.ReactNode,
) {
  const marker = options.ordered ? `${options.start + options.index}.` : '•'

  return (
    <View key={key} style={styles.listItem}>
      <Text style={styles.listMarker}>{marker}</Text>
      <View style={styles.listContent}>
        {node.children.map((child, idx) => render(child as Content, `${key}-${idx}`))}
      </View>
    </View>
  )
}

function renderList(
  node: List,
  key: string,
  render: (node: Content, key: string) => React.ReactNode,
) {
  const isOrdered = Boolean(node.ordered)
  const start = node.start ?? 1
  return (
    <View
      key={key}
      style={isOrdered ? styles.orderedList : styles.unorderedList}
    >
      {node.children.map((child, idx) =>
        renderListItem(
          child as ListItem,
          `${key}-${idx}`,
          {
            ordered: isOrdered,
            index: idx,
            start,
          },
          render,
        ),
      )}
    </View>
  )
}

function renderNodeFactory(headings: ProcessedMarkdown['headings']) {
  let headingIndex = 0

  const render = (node: Content, key: string): React.ReactNode => {
    switch (node.type) {
      case 'paragraph':
        return renderParagraph(node as Paragraph, key)
      case 'heading': {
        const headingNode = node as Heading
        const textContent = headingNode.children
          .map((child) => ('value' in child ? (child as any).value : ''))
          .join('')
        const headingInfo = headings[headingIndex]
        const slug = headingInfo ? headingInfo.slug : slugify(textContent)
        headingIndex += 1
        return (
          <View key={key} id={slug}>
            <Text style={headingStyles[headingNode.depth] || styles.heading6}>
              {renderInlineChildren(headingNode.children as InlineNode[], key)}
            </Text>
          </View>
        )
      }
      case 'image': {
        const imageNode = node as MdImage
        if (!imageNode.url) {
          return null
        }
        return (
          <View key={key} style={styles.imageContainer}>
            <Image src={imageNode.url} style={styles.image} />
            {imageNode.alt ? (
              <Text style={styles.imageCaption}>{imageNode.alt}</Text>
            ) : null}
          </View>
        )
      }
      case 'list':
        return renderList(node as List, key, render)
      case 'blockquote':
        return (
          <View key={key} style={styles.blockquote}>
            {((node as Parent).children as Content[]).map((child, idx) =>
              render(child as Content, `${key}-${idx}`),
            )}
          </View>
        )
      case 'code':
        return (
          <View key={key} style={styles.codeBlock}>
            <Text>{(node as any).value}</Text>
          </View>
        )
      case 'html': {
        const htmlNode = node as Html
        const anchorMatch = htmlNode.value.match(/<a id="([^"]+)"><\/a>/i)
        if (anchorMatch) {
          return <View key={key} id={anchorMatch[1]} style={styles.anchorMarker} />
        }
        const superscript = renderSuperscript(htmlNode, key)
        return superscript
      }
      default:
        if ('children' in node && Array.isArray((node as Parent).children)) {
          return (
            <View key={key}>
              {(node as Parent).children.map((child, idx) =>
                render(child as Content, `${key}-${idx}`),
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

function removeTableOfContents(children: Root['children']): Root['children'] {
  const result: Root['children'] = []
  let skipping = false
  let skipDepth = 0

  children.forEach((node) => {
    if (skipping) {
      if (node.type === 'heading' && (node as Heading).depth <= skipDepth) {
        skipping = false
      } else {
        return
      }
    }

    if (node.type === 'heading') {
      const headingText = toString(node as Heading).trim().toLowerCase()
      if (headingText === 'table of contents') {
        skipping = true
        skipDepth = (node as Heading).depth
        return
      }
    }

    result.push(node)
  })

  return result
}

function buildContentElements(tree: Root, headings: ProcessedMarkdown['headings']) {
  const render = renderNodeFactory(headings)
  const filteredChildren = removeTableOfContents(tree.children)
  return filteredChildren
    .map((node, index) => render(node as Content, `node-${index}`))
    .filter(Boolean)
}

const PageNumber: React.FC = () => (
  <Text
    style={styles.pageNumber}
    render={({ pageNumber }) => (pageNumber > 2 ? `${pageNumber - 2}` : '')}
    fixed
  />
)

const filterHeadingsForToc = (headings: ProcessedMarkdown['headings']) =>
  headings.filter(
    (heading) =>
      heading.text.toLowerCase() !== 'table of contents' &&
      heading.text.toLowerCase() !== 'bibliography',
  )

export async function generatePdf(
  processed: ProcessedMarkdown,
  options?: { originalFileName?: string },
): Promise<Blob> {
  const ast = markdownParser.parse(processed.modified) as Root
  const contentElements = buildContentElements(ast, processed.headings)
  const tocEntries = filterHeadingsForToc(processed.headings)
  const title = processed.title || options?.originalFileName || 'Untitled Document'

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <PageNumber />
        <View style={styles.titlePage}>
          <Text style={styles.titleText}>{title}</Text>
          {options?.originalFileName ? (
            <Text style={styles.subtitleText}>{options.originalFileName}</Text>
          ) : null}
        </View>
      </Page>
      <Page size="A4" style={styles.page}>
        <PageNumber />
        <Text style={styles.tocHeader}>Table of Contents</Text>
        {tocEntries.map((heading, idx) => {
          let entryStyle = styles.tocEntry
          let bullet = '•'
          if (heading.depth === 2) {
            entryStyle = styles.tocEntryIndent
            bullet = '◦'
          } else if (heading.depth >= 3) {
            entryStyle = styles.tocEntryDeepIndent
            bullet = '▪'
          }
          
          return (
            <View key={`toc-${heading.slug}-${idx}`} style={{ flexDirection: 'row', marginBottom: 8 }}>
              <Text style={[entryStyle, styles.tocBullet]}>{bullet}</Text>
              <Link src={`#${heading.slug}`} style={entryStyle}>
                {heading.text}
              </Link>
            </View>
          )
        })}
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
